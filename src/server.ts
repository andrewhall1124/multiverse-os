import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { ServerWebSocket } from "bun";
import { listVariants, getVariant } from "./persona.js";
import { Variant } from "./variant.js";
import { ensureVariantHome } from "./workspace.js";
import { loadHistory, appendMessage, appendSessionBreak, formatTranscript } from "./history.js";

/**
 * Web chat UI for the variants.
 *
 * Layout:
 *   GET  /            -> the single-page chat app (sidebar of variants + chat pane)
 *   GET  /variants    -> JSON list of {id, name, avatar} for the sidebar
 *   GET  /pics/<file> -> a profile pic from profile-pics/
 *   WS   /ws?variant=<id> -> a live chat session backed by one Variant for that persona
 *
 * One websocket == one chat thread == one long-lived Variant. The browser keeps a
 * separate socket (and message history) per variant, so you can flip between threads
 * like a messaging app.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const picsDir = join(repoRoot, "profile-pics");

const multiverseRoot = process.env.MULTIVERSE_ROOT ?? "/Users/andrew/MultiverseOS";
const model = process.env.ANDREW_MODEL ?? "sonnet";
const port = Number(process.env.PORT ?? 3000);

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Set CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token` to use your Claude\n" +
      "subscription) or ANTHROPIC_API_KEY (pay-as-you-go). See .env.example.",
  );
  process.exit(1);
}

const html = readFileSync(join(__dirname, "web", "index.html"), "utf8");

// Public summary of each variant for the sidebar (no system prompt leaked).
const variantList = listVariants().map((v) => ({
  id: v.id,
  name: v.name,
  avatar: `/pics/${v.avatar}`,
}));

const PIC_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// Per-connection state: each socket owns one Variant.
type WSData = { id: string };
const sessions = new Map<ServerWebSocket<WSData>, Variant>();
// Accumulates the assistant's text for the current turn so we can persist it on turn_end.
const assistantBuffers = new Map<ServerWebSocket<WSData>, string>();

const server = Bun.serve<WSData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const id = url.searchParams.get("variant") ?? "muppet";
      // Hand the chosen variant id to the websocket handler via upgrade data.
      return server.upgrade(req, { data: { id } })
        ? undefined
        : new Response("websocket upgrade failed", { status: 426 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/variants") {
      return Response.json(variantList);
    }

    if (url.pathname.startsWith("/pics/")) {
      // basename() strips any path traversal; only serve from picsDir.
      const file = basename(url.pathname.slice("/pics/".length));
      const full = join(picsDir, file);
      const ext = file.split(".").pop()?.toLowerCase() ?? "";
      if (existsSync(full) && PIC_TYPES[ext]) {
        return new Response(Bun.file(full), { headers: { "content-type": PIC_TYPES[ext] } });
      }
      return new Response("not found", { status: 404 });
    }

    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const identity = getVariant(ws.data.id) ?? getVariant("muppet")!;

      // Each variant gets its own home dir under MULTIVERSE_ROOT; it clones repos there itself.
      const workdir = ensureVariantHome(identity.id);

      ws.send(
        JSON.stringify({
          kind: "meta",
          id: identity.id,
          name: identity.name,
          avatar: `/pics/${identity.avatar}`,
          workdir,
        }),
      );

      // Restore prior history to the browser, with a session-break marker at the end
      // so reconnects show a visual divider rather than blending with the previous session.
      const history = loadHistory(identity.id);
      if (history.length > 0) {
        const breakMsg = appendSessionBreak(identity.id);
        ws.send(JSON.stringify({ kind: "history", messages: [...history, breakMsg] }));
      }

      // Inject the prior conversation transcript into the model's system prompt so it
      // has memory across reconnects. Capped at the last 100 chat turns.
      const transcript = formatTranscript(history);
      const contextualIdentity =
        transcript.length > 0
          ? {
              ...identity,
              systemPromptAppend:
                identity.systemPromptAppend +
                "\n\n=== PRIOR CONVERSATION HISTORY ===\n" +
                "The following is the conversation history from a previous session. " +
                "Use it to maintain continuity:\n\n" +
                transcript +
                "\n\n[End of prior history. Continue the conversation naturally.]",
            }
          : identity;

      const variant = new Variant(contextualIdentity, { workdir, model });
      sessions.set(ws, variant);
      assistantBuffers.set(ws, "");

      // Forward every variant event to the browser. run() resolves only on stop().
      variant
        .run((e) => {
          try {
            ws.send(JSON.stringify(e));
            if (e.kind === "text") {
              assistantBuffers.set(ws, (assistantBuffers.get(ws) ?? "") + e.text);
            } else if (e.kind === "turn_end") {
              const buf = assistantBuffers.get(ws) ?? "";
              if (buf.trim().length > 0) {
                appendMessage(identity.id, { role: "assistant", text: buf, ts: Date.now() });
              }
              assistantBuffers.set(ws, "");
            } else if (e.kind === "done" || e.kind === "blocked" || e.kind === "error") {
              const text =
                e.kind === "done"
                  ? "✅ " + e.summary
                  : e.kind === "blocked"
                    ? "⚠️ blocked: " + e.question
                    : "❌ " + e.error;
              appendMessage(identity.id, {
                role: "note",
                noteKind: e.kind,
                text,
                ts: Date.now(),
              });
            }
          } catch {
            // socket already closed mid-stream; nothing to do.
          }
        })
        .catch((err) =>
          ws.send(
            JSON.stringify({ kind: "error", error: err instanceof Error ? err.message : String(err) }),
          ),
        );
    },
    message(ws, raw) {
      const text = (typeof raw === "string" ? raw : raw.toString()).trim();
      if (text) {
        appendMessage(ws.data.id, { role: "user", text, ts: Date.now() });
        sessions.get(ws)?.send(text);
      }
    },
    close(ws) {
      sessions.get(ws)?.stop();
      sessions.delete(ws);
      assistantBuffers.delete(ws);
    },
  },
});

console.log(`🧬  Variants web UI`);
console.log(`clones under: ${multiverseRoot}/<variant>`);
console.log(`variants: ${variantList.map((v) => v.name).join(", ")}`);
console.log(`open: http://localhost:${server.port}`);
