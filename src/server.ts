import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { ServerWebSocket } from "bun";
import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import type { VariantIdentity } from "./persona.js";
import { listVariants, getVariant } from "./persona.js";
import { Variant } from "./variant.js";
import { ensureVariantHome } from "./workspace.js";
import {
  loadHistory,
  appendMessage,
  formatTranscript,
  clearHistory,
  loadSessionId,
  saveSessionId,
} from "./history.js";

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
// In-flight tool calls awaiting their result, so we can persist one combined record
// (call + result) per invocation, keyed by tool_use_id.
const pendingTools = new Map<ServerWebSocket<WSData>, Map<string, { tool: string; summary: string }>>();
// The one socket currently allowed to run each variant. A variant has a single home dir,
// so two live sessions for the same variant would run git in the same working copy at once.
// Opening a new session for a variant takes over and evicts any prior one.
const variantOwners = new Map<string, ServerWebSocket<WSData>>();

// True if the variant's last SDK session is still on disk and can be resumed (so we
// continue the real conversation instead of replaying a transcript into the prompt).
async function resumableSessionId(identity: VariantIdentity, workdir: string): Promise<string | undefined> {
  const saved = loadSessionId(identity.id);
  if (!saved) return undefined;
  try {
    // getSessionMessages returns [] only when the session isn't found, so a non-empty
    // result confirms it exists on disk and can be resumed.
    const msgs = await getSessionMessages(saved, { dir: workdir, limit: 1 });
    return msgs.length > 0 ? saved : undefined;
  } catch {
    return undefined;
  }
}

// Create a Variant from the current history and wire it up to forward events over ws.
// Replaces any previously running Variant for this socket and evicts any other socket
// running the same variant (single-active-session-per-variant).
async function spawnVariant(ws: ServerWebSocket<WSData>, identity: VariantIdentity) {
  const workdir = ensureVariantHome(identity.id);

  // Take over: stop any other socket running this same variant, and any prior variant on
  // this socket, before starting a new one — they'd otherwise share one home dir.
  const prevOwner = variantOwners.get(identity.id);
  if (prevOwner && prevOwner !== ws) {
    sessions.get(prevOwner)?.stop();
    sessions.delete(prevOwner);
    assistantBuffers.delete(prevOwner);
    pendingTools.delete(prevOwner);
    try {
      prevOwner.send(JSON.stringify({ kind: "error", error: "Session taken over by a newer tab." }));
    } catch {
      // socket already gone
    }
  }
  sessions.get(ws)?.stop();
  variantOwners.set(identity.id, ws);

  // Prefer resuming the real SDK session; fall back to transcript injection only when there
  // is no resumable session (e.g. a fresh install or after the session was cleared).
  const resumeSessionId = await resumableSessionId(identity, workdir);
  const transcript = resumeSessionId ? "" : formatTranscript(loadHistory(identity.id));
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

  const variant = new Variant(contextualIdentity, { workdir, model, resumeSessionId });
  sessions.set(ws, variant);
  assistantBuffers.set(ws, "");
  pendingTools.set(ws, new Map());

  variant
    .run((e) => {
      try {
        // Guard: discard events from a variant that has since been replaced (e.g. after interrupt).
        if (sessions.get(ws) !== variant) return;
        // Capture the SDK session id for resume; don't forward it to the browser.
        if (e.kind === "session") {
          saveSessionId(identity.id, e.sessionId);
          return;
        }
        ws.send(JSON.stringify(e));
        if (e.kind === "text") {
          assistantBuffers.set(ws, (assistantBuffers.get(ws) ?? "") + e.text);
        } else if (e.kind === "progress") {
          // Flush accumulated text before each tool call so history entries mirror
          // the UI's per-segment bubble splitting.
          const buf = assistantBuffers.get(ws) ?? "";
          if (buf.trim().length > 0) {
            appendMessage(identity.id, { role: "assistant", text: buf, ts: Date.now() });
            assistantBuffers.set(ws, "");
          }
        } else if (e.kind === "tool_use") {
          // Remember the call; we persist it together with its result below.
          pendingTools.get(ws)?.set(e.toolUseId, { tool: e.tool, summary: e.summary });
        } else if (e.kind === "tool_result") {
          const call = pendingTools.get(ws)?.get(e.toolUseId);
          if (call) {
            pendingTools.get(ws)?.delete(e.toolUseId);
            appendMessage(identity.id, {
              role: "tool",
              tool: call.tool,
              summary: call.summary,
              output: e.output,
              isError: e.isError,
              ts: Date.now(),
            });
          }
        } else if (e.kind === "turn_end") {
          const buf = assistantBuffers.get(ws) ?? "";
          if (buf.trim().length > 0) {
            appendMessage(identity.id, { role: "assistant", text: buf, ts: Date.now() });
          }
          assistantBuffers.set(ws, "");
        } else if (e.kind === "input_request") {
          const optionsText = e.options?.length ? " | " + e.options.join(" | ") : "";
          appendMessage(identity.id, {
            role: "note",
            noteKind: "input_request",
            text: "❓ " + e.prompt + optionsText,
            ts: Date.now(),
          });
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
}

// Return the live Variant for this socket, respawning one if the previous agent loop has
// exited (stream ended/errored). Without this, messages to a dead Variant queue forever.
async function liveVariant(ws: ServerWebSocket<WSData>): Promise<Variant> {
  const current = sessions.get(ws);
  if (current?.isAlive()) return current;
  const identity = getVariant(ws.data.id) ?? getVariant("muppet")!;
  await spawnVariant(ws, identity);
  return sessions.get(ws)!;
}

const server = Bun.serve<WSData>({
  port,
  async fetch(req, server) {
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

    if (url.pathname === "/logo.svg") {
      return new Response(Bun.file(join(__dirname, "web", "logo.svg")), {
        headers: { "content-type": "image/svg+xml; charset=utf-8" },
      });
    }

    if (url.pathname === "/variants") {
      return Response.json(variantList);
    }

    if (url.pathname === "/upload" && req.method === "POST") {
      const variantId = url.searchParams.get("variant") ?? "muppet";
      if (!getVariant(variantId)) return new Response("variant not found", { status: 404 });
      const workdir = ensureVariantHome(variantId);
      const uploadsDir = join(workdir, "uploads");
      mkdirSync(uploadsDir, { recursive: true });

      let form: Awaited<ReturnType<typeof req.formData>>;
      try { form = await req.formData(); } catch {
        return new Response("invalid multipart data", { status: 400 });
      }
      const uploaded = form.get("file");
      if (!uploaded || !(uploaded instanceof File)) return new Response("no file field", { status: 400 });

      const safeName = basename(uploaded.name).replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
      const destPath = join(uploadsDir, safeName);
      writeFileSync(destPath, Buffer.from(await uploaded.arrayBuffer()));
      return Response.json({ path: destPath, name: uploaded.name, size: uploaded.size });
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

    if (req.method === "DELETE" && url.pathname.startsWith("/history/")) {
      const variantId = url.pathname.slice("/history/".length);
      if (!variantId || !listVariants().some((v) => v.id === variantId)) {
        return new Response("not found", { status: 404 });
      }
      clearHistory(variantId);
      return new Response(null, { status: 204 });
    }

    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const identity = getVariant(ws.data.id) ?? getVariant("muppet")!;
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

      const history = loadHistory(identity.id);
      if (history.length > 0) {
        ws.send(JSON.stringify({ kind: "history", messages: history }));
      }

      spawnVariant(ws, identity).catch((err) =>
        ws.send(
          JSON.stringify({ kind: "error", error: err instanceof Error ? err.message : String(err) }),
        ),
      );
    },
    async message(ws, raw) {
      const text = (typeof raw === "string" ? raw : raw.toString()).trim();
      if (!text) return;

      // Parse control messages first; a non-JSON body is just a normal chat message.
      let parsed: { kind?: string; response?: unknown } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      if (parsed?.kind === "input_response" && typeof parsed.response === "string") {
        const response = parsed.response.trim();
        if (!response) return;
        appendMessage(ws.data.id, { role: "user", text: response, ts: Date.now() });
        (await liveVariant(ws)).send(response);
        return;
      }
      if (parsed?.kind === "interrupt") {
        const identity = getVariant(ws.data.id) ?? getVariant("muppet")!;
        // Flush any partial assistant response before stopping.
        const buf = assistantBuffers.get(ws) ?? "";
        if (buf.trim().length > 0) {
          appendMessage(identity.id, { role: "assistant", text: buf, ts: Date.now() });
        }
        // Stop the current variant — this aborts the in-flight turn AND its running tools.
        sessions.get(ws)?.stop();
        // Spawn a fresh variant that resumes the same session and picks up updated history.
        await spawnVariant(ws, identity);
        ws.send(JSON.stringify({ kind: "interrupted" }));
        return;
      }

      appendMessage(ws.data.id, { role: "user", text, ts: Date.now() });
      (await liveVariant(ws)).send(text);
    },
    close(ws) {
      sessions.get(ws)?.stop();
      sessions.delete(ws);
      assistantBuffers.delete(ws);
      pendingTools.delete(ws);
      if (variantOwners.get(ws.data.id) === ws) variantOwners.delete(ws.data.id);
    },
  },
});

console.log(`🧬  Variants web UI`);
console.log(`clones under: ${multiverseRoot}/<variant>`);
console.log(`variants: ${variantList.map((v) => v.name).join(", ")}`);
console.log(`open: http://localhost:${server.port}`);
