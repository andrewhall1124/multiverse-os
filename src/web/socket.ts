// One websocket per variant. Parses every frame as a typed ServerToClient and dispatches
// it. Because the event union is shared with the server (../protocol.js), adding or
// changing an event there surfaces here as a type error.
import type { ServerToClient, VariantMeta } from "../protocol.js";
import { logEl, sendBtn } from "./dom.js";
import { renderMd } from "./markdown.js";
import { appendNode, renderLog } from "./render/log.js";
import { buildToolChip } from "./render/toolchip.js";
import { type LogItem, sessions, type ToolItem, ui } from "./state.js";
import { clearActivity, updateActivity } from "./ui/activity.js";
import { setWorking } from "./ui/composer.js";
import { notify } from "./ui/notifications.js";
import { selectVariant, setSidebarState } from "./ui/sidebar.js";

export function connect(meta: VariantMeta) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?variant=${encodeURIComponent(meta.id)}`);
  const s = sessions[meta.id];
  s.ws = ws;

  ws.onopen = () => {
    s.live = true;
    if (ui.activeId === meta.id && !s.working) sendBtn.disabled = false;
    setSidebarState(meta.id);
  };
  ws.onclose = () => {
    s.live = false;
    s.streaming = null;
    setWorking(meta.id, false);
    if (ui.activeId === meta.id) sendBtn.disabled = true;
  };
  ws.onerror = () => {
    s.live = false;
    setSidebarState(meta.id);
  };

  ws.onmessage = (ev) => {
    const e = JSON.parse(ev.data as string) as ServerToClient;
    const isActive = ui.activeId === meta.id;

    if (e.kind === "meta") {
      // enrich stored meta (workdir, etc.) on first message
      s.meta = { ...s.meta, ...e };
      if (isActive) selectVariant(meta.id);
      return;
    }
    if (e.kind === "history") {
      s.messages = e.messages.map((m): LogItem => {
        if (m.role === "user") return { who: "me", text: m.text };
        if (m.role === "assistant") return { who: "andrew", text: m.text, avatar: s.meta.avatar };
        if (m.role === "tool")
          return {
            kind: "tool",
            tool: m.tool,
            summary: m.summary,
            output: m.output,
            isError: m.isError,
          };
        return { kind: "note", noteKind: m.noteKind, text: m.text };
      });
      if (isActive) renderLog();
      return;
    }
    if (e.kind === "text") {
      if (!s.streaming) {
        s.streaming = { who: "andrew", text: "", avatar: s.meta.avatar, streaming: true };
        s.messages.push(s.streaming);
        if (isActive) {
          if (s.messages.length === 1) renderLog();
          else appendNode(s.streaming);
        }
      }
      s.streaming.text += e.text;
      if (isActive) {
        const rows = logEl.querySelectorAll(".row.andrew");
        const last = rows[rows.length - 1];
        const bubble = last?.querySelector(".bubble");
        if (bubble) {
          bubble.innerHTML = renderMd(s.streaming.text);
          logEl.scrollTop = logEl.scrollHeight;
        }
      }
      return;
    }
    if (e.kind === "progress") {
      // Seal the current streaming bubble so the next text chunk opens a fresh one.
      if (s.streaming) {
        s.streaming.streaming = false;
        s.streaming = null;
        if (isActive) {
          const rows = logEl.querySelectorAll(".row.andrew");
          rows[rows.length - 1]?.querySelector(".bubble")?.classList.remove("cursor");
        }
      }
      s.lastProgress = { tool: e.tool, summary: e.summary };
      if (isActive) updateActivity(s.lastProgress);
      return;
    }
    if (e.kind === "tool_use") {
      // Seal any open streaming bubble, then add a running tool chip.
      if (s.streaming) {
        s.streaming.streaming = false;
        s.streaming = null;
      }
      const chip: ToolItem = {
        kind: "tool",
        toolUseId: e.toolUseId,
        tool: e.tool,
        summary: e.summary,
        output: null,
        isError: false,
        running: true,
      };
      s.messages.push(chip);
      if (isActive) appendNode(chip);
      return;
    }
    if (e.kind === "tool_result") {
      const chip = [...s.messages]
        .reverse()
        .find(
          (m): m is ToolItem => "kind" in m && m.kind === "tool" && m.toolUseId === e.toolUseId,
        );
      if (chip) {
        chip.output = e.output;
        chip.isError = e.isError;
        chip.running = false;
        if (isActive) {
          const node = logEl.querySelector(`[data-tool-id="${CSS.escape(e.toolUseId)}"]`);
          if (node) node.replaceWith(buildToolChip(chip));
        }
      }
      return;
    }
    if (e.kind === "turn_end" || e.kind === "interrupted") {
      if (s.streaming) {
        s.streaming.streaming = false;
        s.streaming = null;
      }
      s.lastProgress = null;
      if (!isActive) s.hasDone = true;
      setWorking(meta.id, false);
      if (isActive) {
        clearActivity();
        renderLog();
      }
      if (e.kind === "turn_end") notify(s.meta.name, "Done thinking.", s.meta.avatar, meta.id);
      return;
    }
    if (e.kind === "input_request") {
      s.pendingInput = { prompt: e.prompt, expected: e.expected, options: e.options };
      return;
    }
    if (e.kind === "done" || e.kind === "blocked" || e.kind === "error") {
      const text =
        e.kind === "done"
          ? `✅ ${e.summary}`
          : e.kind === "blocked"
            ? `⚠️ blocked: ${e.question}`
            : `❌ ${e.error}`;
      s.messages.push({ kind: "note", noteKind: e.kind, text });
      if (!isActive) s.hasDone = true;
      if (e.kind === "error") setWorking(meta.id, false);
      else setSidebarState(meta.id);
      if (isActive) appendNode({ kind: "note", noteKind: e.kind, text });
      const notifBody = e.kind === "done" ? e.summary : e.kind === "blocked" ? e.question : e.error;
      notify(
        s.meta.name +
          (e.kind === "blocked" ? " needs input" : e.kind === "error" ? " errored" : " finished"),
        notifBody,
        s.meta.avatar,
        meta.id,
      );
    }
  };
}
