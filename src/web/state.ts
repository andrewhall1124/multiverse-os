// Client-side view model: the per-variant chat sessions and shared UI state.
import type { VariantMeta } from "../protocol.js";

// ---- Log items (what a chat thread renders) ----
export interface BubbleItem {
  who: "me" | "andrew";
  text: string;
  avatar?: string;
  streaming?: boolean;
}
export interface NoteItem {
  kind: "note";
  noteKind: "done" | "blocked" | "error" | "input_request";
  text: string;
}
export interface ToolItem {
  kind: "tool";
  toolUseId?: string;
  tool: string;
  summary: string;
  output: string | null;
  isError: boolean;
  running?: boolean;
}
export type LogItem = BubbleItem | NoteItem | ToolItem;

export interface PendingInput {
  prompt: string;
  expected: "text" | "choice";
  options?: string[];
}

export interface Session {
  meta: VariantMeta;
  ws: WebSocket | null;
  working: boolean;
  hasDone: boolean;
  lastProgress: { tool: string; summary: string } | null;
  live: boolean;
  streaming: BubbleItem | null;
  messages: LogItem[];
  pendingInput: PendingInput | null;
}

/** One Session per variant id. */
export const sessions: Record<string, Session> = {};

/** Mutable shared UI cursor. `activeId` is reassigned across modules, so it lives here. */
export const ui = { activeId: null as string | null };

/** Uploaded-file attachments pending send, keyed by variant id. */
export interface Attachment {
  name: string;
  path: string;
  size: number;
}
export const pendingAttachments: Record<string, Attachment[]> = {};
