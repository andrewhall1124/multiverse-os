import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PersistedMessage } from "./protocol.js";

export type { PersistedMessage } from "./protocol.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

// History is stored as JSON Lines (one message object per line) so appends are O(1):
// we never re-read or rewrite the whole file just to add a message. Older files were a
// single JSON array; loadHistory still reads those, and the first append migrates them.
function historyPath(variantId: string): string {
  return join(dataDir, `chat-${variantId}.json`);
}

function sessionIdPath(variantId: string): string {
  return join(dataDir, `session-${variantId}.txt`);
}

// Files already known to be in JSONL form this process, so we skip the migration check.
const jsonlReady = new Set<string>();

function parseContent(raw: string): PersistedMessage[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Legacy format: a single pretty-printed JSON array.
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as PersistedMessage[];
    } catch {
      return [];
    }
  }
  // JSONL: one message per line.
  const out: PersistedMessage[] = [];
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as PersistedMessage);
    } catch {
      // skip a corrupt line rather than losing the whole history
    }
  }
  return out;
}

export function loadHistory(variantId: string): PersistedMessage[] {
  const path = historyPath(variantId);
  if (!existsSync(path)) return [];
  try {
    return parseContent(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

export function appendMessage(variantId: string, msg: PersistedMessage): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const path = historyPath(variantId);

  // One-time per process: if this is still a legacy JSON array, rewrite it as JSONL so
  // we can append cleanly. After this we append without ever re-reading the file.
  if (!jsonlReady.has(path)) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      if (raw.trim().startsWith("[")) {
        const lines = parseContent(raw).map((m) => JSON.stringify(m)).join("\n");
        writeFileSync(path, lines.length ? lines + "\n" : "");
      }
    }
    jsonlReady.add(path);
  }

  appendFileSync(path, JSON.stringify(msg) + "\n");
}

export function clearHistory(variantId: string): void {
  if (existsSync(dataDir)) {
    writeFileSync(historyPath(variantId), "");
    jsonlReady.add(historyPath(variantId));
  }
  // A cleared chat should start a brand-new SDK session, not resume the old one.
  clearSessionId(variantId);
}

// --- SDK session id, persisted so a reconnect resumes the real conversation ---

export function loadSessionId(variantId: string): string | undefined {
  const path = sessionIdPath(variantId);
  if (!existsSync(path)) return undefined;
  try {
    const id = readFileSync(path, "utf8").trim();
    return id || undefined;
  } catch {
    return undefined;
  }
}

export function saveSessionId(variantId: string, sessionId: string): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(sessionIdPath(variantId), sessionId);
}

export function clearSessionId(variantId: string): void {
  const path = sessionIdPath(variantId);
  if (existsSync(path)) rmSync(path);
}

// Format the last `limit` entries as a transcript for model context injection. Includes
// tool calls and their results so a resumed-from-transcript agent knows what it already
// did. Only used as a FALLBACK when there is no resumable SDK session (see server.ts).
const TRANSCRIPT_TOOL_OUTPUT = 800;

export function formatTranscript(history: PersistedMessage[], limit = 100): string {
  const entries = history
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
    .slice(-limit);
  return entries
    .map((m) => {
      if (m.role === "user") return `Human: ${m.text}`;
      if (m.role === "assistant") return `Assistant: ${m.text}`;
      const out = m.output.slice(0, TRANSCRIPT_TOOL_OUTPUT);
      const tail = m.output.length > TRANSCRIPT_TOOL_OUTPUT ? "\n…[truncated]" : "";
      return `[Tool ${m.tool}: ${m.summary}]${m.isError ? " (error)" : ""}\n${out}${tail}`;
    })
    .join("\n\n");
}
