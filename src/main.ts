import { runChat } from "./chat.js";
import { runWeb } from "./server.js";

/**
 * Single entry point for Multiverse OS.
 *
 *   bun run src/main.ts web              → web UI at http://localhost:<port>
 *   bun run src/main.ts chat [variant]   → terminal chat with one variant
 */
const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "web":
    runWeb();
    break;
  case "chat":
    runChat(rest[0]);
    break;
  default:
    console.error("Usage: multiverse <web | chat [variant]>");
    process.exit(1);
}
