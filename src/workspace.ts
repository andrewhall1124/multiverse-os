import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-variant home directory.
 *
 * Each variant works with its `cwd` set to its OWN directory at MULTIVERSE_ROOT/<id>. The
 * harness only guarantees that empty directory exists — it does NOT clone anything. The
 * variant builds out its own filesystem from there: it clones whatever repos it needs,
 * creates branches, commits, and pushes/pulls on its own.
 */

const ROOT = process.env.MULTIVERSE_ROOT ?? "/Users/andrew/MultiverseOS";

/** Ensure MULTIVERSE_ROOT/<id> exists (empty if new). Returns the absolute dir. */
export function ensureVariantHome(id: string): string {
  const dir = join(ROOT, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}
