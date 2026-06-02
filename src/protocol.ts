/**
 * Wire protocol shared by the server and the browser client.
 *
 * This is the single source of truth for what travels over the websocket. Both
 * `src/variant.ts` / `src/server.ts` (server) and `src/web/*` (client) import these
 * types, so changing an event shape produces a type error on BOTH sides — the contract
 * is checked end to end instead of being duplicated by hand.
 *
 * Type-only on the client: the browser imports these with `import type`, so they erase
 * at transpile time and never become a runtime fetch.
 */

/** Events a Variant emits during a turn (server-side), forwarded over the socket. */
export type VariantEvent =
  | { kind: "text"; text: string } // streamed assistant prose
  | { kind: "turn_end" } // model finished responding to the current message
  | { kind: "interrupted" } // user cancelled the current turn
  | { kind: "done"; summary: string } // task complete, ready for review
  | { kind: "blocked"; question: string } // needs a human decision
  | { kind: "input_request"; prompt: string; expected: "text" | "choice"; options?: string[] } // structured input
  | { kind: "progress"; tool: string; summary: string } // tool use in flight
  | { kind: "tool_use"; tool: string; summary: string; toolUseId: string } // a tool call, for the persisted record
  | { kind: "tool_result"; toolUseId: string; output: string; isError: boolean } // its (truncated) result
  | { kind: "session"; sessionId: string } // SDK session id, captured so we can resume it later
  | { kind: "error"; error: string };

/** A persisted chat-history entry (one JSON-Lines record per message). */
export type PersistedMessage =
  | { role: "user"; text: string; ts: number }
  | { role: "assistant"; text: string; ts: number }
  // One record per tool invocation: the call (tool + summary) and its truncated result.
  | { role: "tool"; tool: string; summary: string; output: string; isError: boolean; ts: number }
  | { role: "note"; noteKind: "done" | "blocked" | "error" | "input_request"; text: string; ts: number };

/** Public summary of a variant, used for the sidebar and the per-connection meta event. */
export interface VariantMeta {
  id: string;
  name: string;
  avatar: string;
  workdir?: string;
}

/** Everything the server can push to the client over the websocket. */
export type ServerToClient =
  | VariantEvent
  | ({ kind: "meta" } & VariantMeta)
  | { kind: "history"; messages: PersistedMessage[] };

/** Control frames the client sends as JSON (normal chat messages are sent as raw text). */
export type ClientToServer =
  | { kind: "interrupt" }
  | { kind: "input_response"; response: string };
