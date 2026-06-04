import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { config, requireAuth } from "./config.js";
import { loadAndrew } from "./persona.js";
import { Variant } from "./variant.js";
import { ensureVariantHome } from "./workspace.js";

/**
 * Minimal "chat app" surface for one variant, in the terminal.
 *
 * This is the seam where the real product lives later: replace the readline loop and
 * the console handlers below with your web UI / websocket / push notifications, and the
 * Variant class underneath doesn't change. Multiple variants = multiple Variant instances,
 * each its own chat thread.
 */
export function runChat(variantId?: string): void {
  requireAuth();

  const andrew = loadAndrew(variantId);
  // Each variant gets its own home dir under the workspace root; it clones repos there itself.
  const workdir = ensureVariantHome(andrew.id);

  const variant = new Variant(andrew, { workdir, model: config.model });

  const rl = createInterface({ input: stdin, output: stdout });

  function header() {
    console.log(`\n${andrew.name}`);
    console.log(`working in: ${workdir}`);
    console.log(`type a task and hit enter. Ctrl+C to quit.\n`);
  }

  // Drive the variant in the background; events come back asynchronously.
  variant
    .run((e) => {
      switch (e.kind) {
        case "text":
          stdout.write(e.text);
          break;
        case "turn_end":
          stdout.write("\n");
          prompt();
          break;
        case "done":
          console.log(`\n\n✅ ${andrew.name} finished: ${e.summary}`);
          console.log(`   review with:  git -C ${workdir} diff   (or check the andrew/* branch)`);
          break;
        case "blocked":
          console.log(`\n\n⚠️  ${andrew.name} is blocked: ${e.question}`);
          break;
        case "error":
          console.error(`\n\n❌ error: ${e.error}`);
          break;
      }
    })
    .catch((err) => console.error(err));

  async function prompt() {
    const line = (await rl.question("you › ")).trim();
    if (!line) return prompt();
    stdout.write(`\n`);
    variant.send(line);
    // We don't await here — the reply streams in via the event handler above, which
    // calls prompt() again on turn_end. This is what makes it feel async.
  }

  rl.on("close", () => {
    variant.stop();
    console.log("\nbye");
    process.exit(0);
  });

  header();
  prompt();
}
