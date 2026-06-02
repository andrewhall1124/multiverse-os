import { query } from "@anthropic-ai/claude-agent-sdk";
import type { VariantIdentity } from "./persona.js";
import type { VariantEvent } from "./protocol.js";
import { makeGuardrails } from "./guardrails.js";

export type { VariantEvent } from "./protocol.js";

/**
 * A single variant running on top of the Claude Agent SDK harness.
 *
 * Design notes (these map to the brainstorm):
 *  - Stateful chat: we run ONE long-lived `query()` in streaming-input mode, feeding
 *    the human's messages in as they type. That gives multi-turn memory ("message the
 *    variant like a chat app") instead of a fresh agent per message.
 *  - Filesystem isolation: each variant runs with its `cwd` set to its OWN home directory
 *    (MULTIVERSE_ROOT/<id>, just an empty dir ensured in workspace.ts). The variant clones
 *    whatever repos it needs there itself and works on andrew/<task-slug> branches. Spawning
 *    N variants is just N instances of this class pointed at N separate home dirs.
 *  - Async "ping me when done": the model ends with a DONE:/BLOCKED: line, which we
 *    surface to the UI as a notification. Swap the console handlers in chat.ts for push
 *    notifications / Slack / a websocket to a real chat app.
 *  - Guardrails: canUseTool blocks protected-branch pushes and destructive commands.
 */

// Tool outputs (file dumps, command logs) can be huge; cap what we emit/persist so the
// history file and the resume-fallback transcript stay bounded.
const MAX_TOOL_OUTPUT = 2000;

export interface VariantOptions {
  workdir: string;
  model?: string; // "opus" for hard work, "sonnet" to save cost
  // Resume a prior SDK session (loads its real conversation history, tool calls and all)
  // instead of re-injecting a lossy transcript blob into the system prompt.
  resumeSessionId?: string;
}

// Minimal view of the SDK message stream — we only read the fields we use.
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

// Tool results come back as `user` messages whose content is an array of tool_result
// blocks. (Our own human input is a `user` message whose content is a plain string.)
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
};

type SDKMsg =
  | { type: "assistant"; message: { content: ContentBlock[] }; session_id?: string }
  | { type: "user"; message: { content: unknown }; session_id?: string }
  | { type: "tool_progress"; tool_name: string; elapsed_time_seconds: number; session_id?: string }
  | { type: "result"; subtype?: string; session_id?: string }
  | { type: string; session_id?: string; [k: string]: unknown };

export class Variant {
  private queue: string[] = [];
  private resolveNext: ((v: void) => void) | null = null;
  private closed = false;
  // Aborts the in-flight SDK query (and any tool it is running) when we stop. Without
  // this, setting `closed` only stops us feeding NEW input — the current turn, and its
  // tools, keep executing in the background.
  private abort = new AbortController();
  // False once the agent loop has exited (stream ended, errored, or aborted). Callers
  // check this so a dead Variant isn't silently fed messages it will never answer.
  private alive = true;

  constructor(
    public readonly identity: VariantIdentity,
    private readonly opts: VariantOptions,
  ) {}

  /** True while the agent loop is running and able to answer messages. */
  isAlive(): boolean {
    return this.alive && !this.closed;
  }

  /** Push a human message to the variant. Returns immediately; replies arrive via events. */
  send(text: string) {
    this.queue.push(text);
    this.resolveNext?.();
    this.resolveNext = null;
  }

  /** Stop the session: end input AND abort any in-flight turn/tool. */
  stop() {
    this.closed = true;
    this.resolveNext?.();
    this.resolveNext = null;
    this.abort.abort();
  }

  // Streaming-input generator: yields the human's messages as SDK user messages.
  private async *inputStream(): AsyncGenerator<unknown> {
    while (!this.closed) {
      while (this.queue.length > 0) {
        const content = this.queue.shift()!;
        // SDKUserMessage shape for streaming input mode.
        yield { type: "user", message: { role: "user", content } };
      }
      if (this.closed) break;
      await new Promise<void>((resolve) => {
        this.resolveNext = resolve;
      });
    }
  }

  /**
   * Start the agent loop. Drives `on(event)` for every interesting thing the variant does.
   * Resolves only when the session is stopped.
   */
  async run(on: (e: VariantEvent) => void): Promise<void> {
    let turnBuffer = "";
    let reportedSession = false;

    try {
      const stream = query({
        prompt: this.inputStream() as never,
        options: {
          model: this.opts.model ?? "sonnet",
          cwd: this.opts.workdir,
          // Abort the underlying agent process (and its running tools) on stop().
          abortController: this.abort,
          // Continue the prior conversation in-place (real turns + tool history) when we
          // have a resumable session id, rather than replaying a transcript into the prompt.
          ...(this.opts.resumeSessionId ? { resume: this.opts.resumeSessionId } : {}),
          // Use Claude Code's full prompt, then layer Andrew's persona on top.
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: this.identity.systemPromptAppend,
          },
          // Also pick up the target repo's own CLAUDE.md / conventions if present.
          settingSources: ["project"],
          // The variant needs to read, write, run commands, and search within its home dir.
          allowedTools: [
            "Read",
            "Write",
            "Edit",
            "Glob",
            "Grep",
            "Bash",
            "WebSearch",
            "WebFetch",
            "TodoWrite",
          ],
          permissionMode: "acceptEdits",
          // Scope the guardrails to THIS variant's home dir so it can't edit files elsewhere.
          canUseTool: makeGuardrails(this.opts.workdir),
        } as never,
      });

      for await (const raw of stream as AsyncIterable<SDKMsg>) {
        const msg = raw;

        // Capture the SDK session id once so the caller can persist it and resume later.
        if (!reportedSession && typeof msg.session_id === "string" && msg.session_id) {
          reportedSession = true;
          on({ kind: "session", sessionId: msg.session_id });
        }

        if (msg.type === "assistant") {
          for (const block of (msg as Extract<SDKMsg, { type: "assistant" }>).message.content) {
            if (block.type === "text" && block.text) {
              turnBuffer += block.text;
              on({ kind: "text", text: block.text });
            } else if (block.type === "tool_use") {
              const b = block as Extract<ContentBlock, { type: "tool_use" }>;
              const summary = toolSummary(b.name, b.input);
              // progress drives the live activity bar; tool_use is the persisted record.
              on({ kind: "progress", tool: b.name, summary });
              on({ kind: "tool_use", tool: b.name, summary, toolUseId: b.id });
            }
          }
        } else if (msg.type === "user") {
          // Synthetic user messages carry tool results (array content). Human input is a
          // plain string and is ignored here.
          const content = (msg as Extract<SDKMsg, { type: "user" }>).message.content;
          if (Array.isArray(content)) {
            for (const block of content as ToolResultBlock[]) {
              if (block && block.type === "tool_result" && typeof block.tool_use_id === "string") {
                on({
                  kind: "tool_result",
                  toolUseId: block.tool_use_id,
                  output: truncate(toolResultText(block.content), MAX_TOOL_OUTPUT),
                  isError: block.is_error === true,
                });
              }
            }
          }
        } else if (msg.type === "tool_progress") {
          const tp = msg as Extract<SDKMsg, { type: "tool_progress" }>;
          const elapsed = Math.round(tp.elapsed_time_seconds);
          on({
            kind: "progress",
            tool: tp.tool_name,
            summary: elapsed > 0 ? `${elapsed}s elapsed` : "running",
          });
        } else if (msg.type === "result") {
          // The model finished responding to the current human message.
          // turn_end fires first so sentinel events (done/blocked) fire last and their
          // notification wins (both use tag: variantId, last write wins in the browser).
          // Also ensures server flushes the text buffer before appending the done note.
          const sentinel = parseSentinel(turnBuffer);
          on({ kind: "turn_end" });
          if (sentinel) on(sentinel);
          turnBuffer = "";
        }
      }
    } catch (err) {
      // An intentional stop() aborts the query; that surfaces as an AbortError we don't
      // want to report as a failure.
      if (!this.abort.signal.aborted) {
        on({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      this.alive = false;
    }
  }
}

// The variant signals control intents (done/blocked/needs-input) with a sentinel line.
// The protocol puts it as the FINAL line of the message, so we only consider the last
// non-empty line — and we strip fenced code blocks first so a "DONE:" inside an example
// or quoted snippet can't false-trigger.
function parseSentinel(text: string): Extract<
  VariantEvent,
  { kind: "done" | "blocked" | "input_request" }
> | null {
  const line = lastNonEmptyLine(stripCodeFences(text));
  if (!line) return null;
  if (line.startsWith("DONE:")) return { kind: "done", summary: line.slice("DONE:".length).trim() };
  if (line.startsWith("BLOCKED:"))
    return { kind: "blocked", question: line.slice("BLOCKED:".length).trim() };
  if (line.startsWith("INPUT_REQUEST:")) return parseInputRequest(line.slice("INPUT_REQUEST:".length));
  return null;
}

// Parses the body of an INPUT_REQUEST line in two formats:
//   text: What is the API key?
//   choice: Which branch? | main | dev | other
function parseInputRequest(rest: string): Extract<VariantEvent, { kind: "input_request" }> | null {
  const trimmed = rest.trim();
  const sep = trimmed.indexOf(":");
  if (sep === -1) return null;
  const type = trimmed.slice(0, sep).trim();
  const body = trimmed.slice(sep + 1).trim();
  if (type === "choice") {
    const parts = body.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const [prompt, ...options] = parts;
    return { kind: "input_request", prompt, expected: "choice", options };
  }
  if (type === "text") {
    return { kind: "input_request", prompt: body, expected: "text" };
  }
  return null;
}

// Removes ```...``` fenced blocks so sentinel scanning ignores code/quoted examples.
function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, "");
}

function lastNonEmptyLine(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.length > 0);
  return line ?? null;
}

// Flattens a tool_result's content (string, or array of text blocks) to plain text.
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c && c.type === "text" ? String(c.text ?? "") : ""))
      .join("");
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + `\n…[truncated ${text.length - max} chars]` : text;
}

function toolSummary(tool: string, input: Record<string, unknown>): string {
  const str = (k: string) => String(input[k] ?? "");
  switch (tool) {
    case "Bash": return str("command").slice(0, 80);
    case "Read": return str("file_path");
    case "Write": return str("file_path");
    case "Edit": return str("file_path");
    case "Glob": return str("pattern");
    case "Grep": return str("pattern");
    case "WebSearch": return str("query");
    case "WebFetch": return str("url").slice(0, 80);
    case "TodoWrite": return "updating todos";
    default: return tool;
  }
}
