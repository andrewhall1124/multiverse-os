import { resolve, relative, isAbsolute } from "node:path";

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
 *     own home and work there.
 *  2. Damage control on Bash: block force pushes, protected-branch pushes, rm -rf /, etc.
 *
 * The shape of the allow/deny result matches the SDK's PermissionResult:
 *   { behavior: "allow", updatedInput }  |  { behavior: "deny", message }
 */

const PROTECTED = (process.env.PROTECTED_BRANCHES ?? "main,master,dev,develop")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

// Commands we never let a variant run unattended.
const DESTRUCTIVE: { pattern: RegExp; why: string }[] = [
  { pattern: /\brm\s+-rf?\s+(\/|~|\$HOME)/, why: "refuses to recursively delete from a root/home path" },
  { pattern: /\bgit\s+push\b.*\b(-f|--force|--force-with-lease)\b/, why: "won't force-push" },
  { pattern: /\bgit\s+reset\s+--hard\b/, why: "won't hard-reset (destroys uncommitted work)" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, why: "won't git-clean force (deletes untracked files)" },
  { pattern: /\b(sudo|chmod\s+-R\s+777)\b/, why: "won't escalate privileges or wide-open permissions" },
];

// Tools that mutate the filesystem, mapped to the input field holding their target path.
const WRITE_TOOLS: Record<string, string> = {
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
};

function pushesToProtectedBranch(cmd: string): string | null {
  if (!/\bgit\s+push\b/.test(cmd)) return null;
  for (const branch of PROTECTED) {
    // matches `git push origin main`, `git push origin HEAD:main`, etc.
    const re = new RegExp(`\\b(${branch})\\b`);
    if (re.test(cmd.replace(/^.*git\s+push/, ""))) return branch;
  }
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

      for (const { pattern, why } of DESTRUCTIVE) {
        if (pattern.test(cmd)) {
          return { behavior: "deny", message: `Blocked: this variant ${why}.` };
        }
      }
    }

    return { behavior: "allow", updatedInput: input };
  };
}
