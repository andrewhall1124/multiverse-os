import { mkdirSync, writeFileSync, copyFileSync, existsSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Per-variant home directory.
 *
 * Each variant works with its `cwd` set to its OWN directory at MULTIVERSE_ROOT/<id>. The
 * harness only guarantees that empty directory exists — it does NOT clone anything. The
 * variant builds out its own filesystem from there: it clones whatever repos it needs,
 * creates branches, commits, and pushes/pulls on its own.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MULTIVERSE_ROOT ?? "/Users/andrew/MultiverseOS";

// Absolute path to the post-commit hook stored in this repo.
const HOOK_SRC = join(__dirname, "..", "git-hooks", "post-commit");

/**
 * Ensure MULTIVERSE_ROOT/<id> exists and is wired with a gitconfig + git init template
 * that installs the auto-push post-commit hook into any repo the variant clones.
 *
 * Variants should run:
 *   GIT_CONFIG_GLOBAL=<workdir>/.gitconfig git clone <url>
 * or set the env var for the duration of their session.
 */
export function ensureVariantHome(id: string): string {
  const dir = join(ROOT, id);
  mkdirSync(dir, { recursive: true });

  // Git init template dir: any git clone that uses this template gets the hook.
  const templateHooksDir = join(dir, ".git-template", "hooks");
  mkdirSync(templateHooksDir, { recursive: true });
  if (existsSync(HOOK_SRC)) {
    copyFileSync(HOOK_SRC, join(templateHooksDir, "post-commit"));
    // copyFileSync doesn't preserve permissions — set executable bit explicitly.
    chmodSync(join(templateHooksDir, "post-commit"), 0o755);
  }

  // Per-variant gitconfig: points init.templateDir at our template so every
  // `git clone` (or `git init`) done with GIT_CONFIG_GLOBAL set auto-installs the hook.
  const gitconfigPath = join(dir, ".gitconfig");
  writeFileSync(
    gitconfigPath,
    `[init]\n\ttemplateDir = ${join(dir, ".git-template")}\n`,
  );

  return dir;
}
