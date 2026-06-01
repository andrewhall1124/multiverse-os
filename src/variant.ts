import { query } from "@anthropic-ai/claude-agent-sdk";
import type { VariantIdentity } from "./persona.js";
import { makeGuardrails } from "./guardrails.js";

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

export type VariantEvent =
  | { kind: "text"; text: string } // streamed assistant prose
  | { kind: "turn_end" } // model finished responding to the current message
  | { kind: "done"; summary: string } // task complete, ready for review
  | { kind: "blocked"; question: string } // needs a human decision
  | { kind: "error"; error: string };

export interface VariantOptions {
  workdir: string;
  model?: string; // "opus" for hard work, "sonnet" to save cost
}

// Minimal view of the SDK message stream — we only read the fields we use.
type SDKMsg =
  | { type: "assistant"; message: { content: Array<{ type: string; text?: string }> } }
  | { type: "result"; subtype?: string }
  | { type: string; [k: string]: unknown };

export class Variant {
  private queue: string[] = [];
  private resolveNext: ((v: void) => void) | null = null;
  private closed = false;

  constructor(
    public readonly identity: VariantIdentity,
    private readonly opts: VariantOptions,
  ) {}

  /** Push a human message to the variant. Returns immediately; replies arrive via events. */
  send(text: string) {
    this.queue.push(text);
    this.resolveNext?.();
    this.resolveNext = null;
  }

  /** Stop the session. */
  stop() {
    this.closed = true;
    this.resolveNext?.();
    this.resolveNext = null;
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

    try {
      const stream = query({
        prompt: this.inputStream() as never,
        options: {
          model: this.opts.model ?? "sonnet",
          cwd: this.opts.workdir,
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

        if (msg.type === "assistant") {
          for (const block of (msg as Extract<SDKMsg, { type: "assistant" }>).message.content) {
            if (block.type === "text" && block.text) {
              turnBuffer += block.text;
              on({ kind: "text", text: block.text });
            }
          }
        } else if (msg.type === "result") {
          // The model finished responding to the current human message.
          const done = matchLine(turnBuffer, "DONE:");
          const blocked = matchLine(turnBuffer, "BLOCKED:");
          if (done) on({ kind: "done", summary: done });
          else if (blocked) on({ kind: "blocked", question: blocked });
          on({ kind: "turn_end" });
          turnBuffer = "";
        }
        // Other message types (task progress, system, tool use) are ignored here but
        // are where you'd hook richer chat-app UI: live "Andrew is editing foo.ts…".
      }
    } catch (err) {
      on({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
}

function matchLine(text: string, prefix: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}
