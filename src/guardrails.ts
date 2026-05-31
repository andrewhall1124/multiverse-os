/**
 * Safety rails for an autonomous variant.
 *
 * Implemented as a `canUseTool` permission callback — the SDK calls this before every
 * tool use and we allow or deny. We focus on the Bash tool, which is where the real
 * damage happens (force pushes, rm -rf, etc.).
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

function pushesToProtectedBranch(cmd: string): string | null {
  if (!/\bgit\s+push\b/.test(cmd)) return null;
  for (const branch of PROTECTED) {
    // matches `git push origin main`, `git push origin HEAD:main`, etc.
    const re = new RegExp(`\\b(${branch})\\b`);
    if (re.test(cmd.replace(/^.*git\s+push/, ""))) return branch;
  }
  return null;
}

export type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export async function canUseTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  if (toolName === "Bash") {
    const cmd = String((input as { command?: string }).command ?? "");

    const branch = pushesToProtectedBranch(cmd);
    if (branch) {
      return {
        behavior: "deny",
        message:
          `Blocked: pushing to protected branch "${branch}" is not allowed. ` +
          "Work on your andrew/<task> branch and hand back a diff for review instead.",
      };
    }

    for (const { pattern, why } of DESTRUCTIVE) {
      if (pattern.test(cmd)) {
        return { behavior: "deny", message: `Blocked: this variant ${why}.` };
      }
    }
  }

  return { behavior: "allow", updatedInput: input };
}
