import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

export type PersistedMessage =
  | { role: "user"; text: string; ts: number }
  | { role: "assistant"; text: string; ts: number }
  | { role: "note"; noteKind: "done" | "blocked" | "error" | "input_request"; text: string; ts: number };

function historyPath(variantId: string): string {
  return join(dataDir, `chat-${variantId}.json`);
}

export function loadHistory(variantId: string): PersistedMessage[] {
  const path = historyPath(variantId);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PersistedMessage[];
  } catch {
    return [];
  }
}

export function appendMessage(variantId: string, msg: PersistedMessage): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const history = loadHistory(variantId);
  history.push(msg);
  writeFileSync(historyPath(variantId), JSON.stringify(history, null, 2));
}

export function clearHistory(variantId: string): void {
  if (!existsSync(dataDir)) return;
  writeFileSync(historyPath(variantId), "[]");
}

// Format the last `limit` chat turns as a transcript for model context injection.
export function formatTranscript(history: PersistedMessage[], limit = 100): string {
  const chat = history.filter((m) => m.role === "user" || m.role === "assistant").slice(-limit);
  return chat.map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.text}`).join("\n\n");
}
