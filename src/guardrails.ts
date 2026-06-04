import { isAbsolute, relative, resolve } from "node:path";
import { config } from "./config.js";

/**
 * Safety rails for an autonomous variant.
 *
 * Implemented as a `canUseTool` permission callback — the SDK calls this before every
 * tool use and we allow or deny. Per the Agent SDK docs, filesystem access is confined via
 * exactly this kind of permission rule (not the OS sandbox), so we use it for two jobs:
 *
 *  1. Confinement: keep the variant inside its OWN home directory (its cwd). Without this,
 *     setting `cwd` alone does NOT stop the model from editing absolute paths elsewhere on
 *     disk — and it will (e.g. wandering into this project's checkout). We deny file writes
 *     outside the home dir, which forces the variant to clone the repos it needs into its
 *     own home and work there. We check the Write/Edit tools AND best-effort scan Bash for
 *     absolute-path writes (redirects, tee/cp/mv, dd) that would escape the home dir.
 *  2. Damage control on Bash: block force pushes, protected-branch pushes, rm -rf /, etc.
 *
 * IMPORTANT — this is defense-in-depth, not a sandbox. Regex over a shell command string
 * cannot be airtight: a determined process can still escape via relative paths after `cd`,
 * eval'd strings, subshells, or interpreters. For untrusted/fully-autonomous use, run the
 * whole variant inside an OS sandbox (sandbox-exec / a container) and treat these checks as
 * a second layer, not the only one.
 *
 * The shape of the allow/deny result matches the SDK's PermissionResult:
 *   { behavior: "allow", updatedInput }  |  { behavior: "deny", message }
 */

const PROTECTED = config.protectedBranches;

// Commands we never let a variant run unattended.
const DESTRUCTIVE: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\brm\s+-rf?\s+(\/|~|\$HOME)/,
    why: "refuses to recursively delete from a root/home path",
  },
  // NB: the flag boundary is a leading space, not \b — `\b` never matches before a dash,
  // which silently disabled this check before.
  { pattern: /\bgit\s+push\b.*?\s(-f|--force|--force-with-lease)\b/, why: "won't force-push" },
  { pattern: /\bgit\s+reset\s+--hard\b/, why: "won't hard-reset (destroys uncommitted work)" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, why: "won't git-clean force (deletes untracked files)" },
  {
    pattern: /\b(sudo|chmod\s+-R\s+777)\b/,
    why: "won't escalate privileges or wide-open permissions",
  },
];

// Credential env vars the variant must never read or print — blocking exfiltration of the
// OAuth token / API key it runs with.
const SECRET_VARS = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

// Tools that mutate the filesystem, mapped to the input field holding their target path.
const WRITE_TOOLS: Record<string, string> = {
  Write: "file_path",
  Edit: "file_path",
};

// Pulls the argument string of a `git push` out of a (possibly compound) command, stopping
// at a shell separator so we don't swallow a following command.
function gitPushArgs(cmd: string): string | null {
  const m = cmd.match(/\bgit\b[^|&;]*?\bpush\b([^|&;]*)/);
  return m ? m[1] : null;
}

// The branch a push token actually WRITES on the remote: strip a leading `+` (force
// refspec), take the dst of a `src:dst` refspec, and drop a refs/heads/ prefix.
function destBranch(token: string): string {
  const noForce = token.replace(/^\+/, "");
  const dst = noForce.includes(":") ? noForce.split(":").pop()! : noForce;
  return dst.replace(/^refs\/heads\//, "");
}

function pushesToProtectedBranch(cmd: string): string | null {
  const args = gitPushArgs(cmd);
  if (args === null) return null;
  const tokens = args.split(/\s+/).filter(Boolean);
  // --mirror / --all fan out to every local ref, protected branches included.
  if (tokens.some((t) => t === "--mirror" || t === "--all")) return "(all branches)";
  for (const tok of tokens) {
    if (tok.startsWith("-")) continue; // flag, e.g. --set-upstream
    // Match the exact destination branch name, not a substring anywhere in the command
    // (so `git push origin feature-main` is NOT mistaken for a push to `main`).
    if (PROTECTED.includes(destBranch(tok))) return destBranch(tok);
  }
  return null;
}

// Force pushes via the `+refspec` form (e.g. `git push origin +HEAD:topic`) that the
// `--force`/`-f` regex misses.
function forcePushesViaRefspec(cmd: string): boolean {
  const args = gitPushArgs(cmd);
  if (args === null) return false;
  return args
    .split(/\s+/)
    .filter(Boolean)
    .some((t) => t.startsWith("+"));
}

// Best-effort scan for Bash that WRITES to an absolute path outside the home dir:
// output redirections (`> /abs`, `>> /abs`), and tee/cp/mv/install/dd targets. Relative
// paths resolve against the (unknowable post-`cd`) cwd, so we only flag absolute escapes.
// Returns the offending path, or null.
function bashWriteOutsideHome(cmd: string, home: string): string | null {
  // /dev/null, /dev/stderr, etc. are harmless write targets and appear constantly
  // (`2>/dev/null`), so they don't count as escaping the home dir.
  const escapes = (target: string) =>
    target.startsWith("/") && !target.startsWith("/dev/") && !isInsideHome(home, target);

  for (const m of cmd.matchAll(/(?:^|[\s;&|])\d*>>?\s*("?)(\/[^\s"'|&;]+)/g)) {
    if (escapes(m[2])) return m[2];
  }
  for (const m of cmd.matchAll(/\b(?:tee|cp|mv|install)\b\s+([^\n;|&]*)/g)) {
    for (const tok of m[1].split(/\s+/).filter(Boolean)) {
      if (!tok.startsWith("-") && escapes(tok)) return tok;
    }
  }
  const dd = cmd.match(/\bdd\b[^\n;|&]*\bof=("?)(\/[^\s"'|&;]+)/);
  if (dd && escapes(dd[2])) return dd[2];
  return null;
}

/** True if `target` resolves to a path inside `home` (relative paths resolve against it). */
function isInsideHome(home: string, target: string): boolean {
  const abs = resolve(home, target); // absolute stays; relative resolves against the home dir
  const rel = relative(home, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResult>;

/**
 * Build a permission callback scoped to one variant's home directory. Pass the variant's
 * workdir (its cwd) so confinement is enforced relative to it.
 */
export function makeGuardrails(workdir: string): CanUseTool {
  const home = resolve(workdir);

  return async function canUseTool(toolName, input): Promise<PermissionResult> {
    // 1. Confine filesystem writes to the variant's own home directory.
    const pathField = WRITE_TOOLS[toolName];
    if (pathField) {
      const target = input[pathField];
      if (typeof target === "string" && !isInsideHome(home, target)) {
        return {
          behavior: "deny",
          message:
            `Blocked: "${target}" is outside your home directory (${home}). ` +
            "Work inside your home dir — clone the repo you need into it (git clone …) " +
            "and edit files there, rather than touching files elsewhere on disk.",
        };
      }
    }

    // 2. Bash damage control.
    if (toolName === "Bash") {
      const cmd = String((input as { command?: string }).command ?? "");

      const branch = pushesToProtectedBranch(cmd);
      if (branch) {
        return {
          behavior: "deny",
          message:
            `Blocked: pushing to protected branch "${branch}" is not allowed. ` +
            "Work on your <variant-id>/<task> branch and hand back a diff for review instead.",
        };
      }

      if (forcePushesViaRefspec(cmd)) {
        return { behavior: "deny", message: "Blocked: this variant won't force-push (+refspec)." };
      }

      const secret = SECRET_VARS.find((v) => cmd.includes(v));
      if (secret) {
        return {
          behavior: "deny",
          message: `Blocked: won't read or print the credential "${secret}".`,
        };
      }

      const escaped = bashWriteOutsideHome(cmd, home);
      if (escaped) {
        return {
          behavior: "deny",
          message:
            `Blocked: "${escaped}" is outside your home directory (${home}). ` +
            "Write inside your home dir — work in the repo you cloned there.",
        };
      }

      for (const { pattern, why } of DESTRUCTIVE) {
        if (pattern.test(cmd)) {
          return { behavior: "deny", message: `Blocked: this variant ${why}.` };
        }
      }
    }

    return { behavior: "allow", updatedInput: input };
  };
}
