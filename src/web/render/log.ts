// Renders the chat log for the active variant.

import { logEl } from "../dom.js";
import { renderMd } from "../markdown.js";
import { type LogItem, sessions, ui } from "../state.js";
import { buildInputCard } from "../ui/inputcard.js";
import { buildToolChip } from "./toolchip.js";

export function appendNode(m: LogItem) {
  if ("kind" in m && m.kind === "tool") {
    logEl.appendChild(buildToolChip(m));
    logEl.scrollTop = logEl.scrollHeight;
    return;
  }
  if ("kind" in m && m.kind === "note") {
    const n = document.createElement("div");
    n.className = `note ${m.noteKind}`;
    n.textContent = m.text;
    logEl.appendChild(n);
  } else {
    const bubble = m as Extract<LogItem, { who: string }>;
    const row = document.createElement("div");
    row.className = `row ${bubble.who}`;

    const b = document.createElement("div");
    b.className = "bubble";
    if (bubble.who === "andrew") {
      b.innerHTML = renderMd(bubble.text);
    } else {
      b.textContent = bubble.text;
    }
    if (bubble.streaming) b.classList.add("cursor");
    row.appendChild(b);
    row.dataset.streaming = bubble.streaming ? "1" : "";
    logEl.appendChild(row);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

export function renderLog() {
  const s = ui.activeId ? sessions[ui.activeId] : null;
  logEl.innerHTML = "";
  if (!s || (s.messages.length === 0 && !s.pendingInput)) {
    const e = document.createElement("div");
    e.id = "empty";
    e.textContent = `Say hi to ${s ? s.meta.name : "Andrew"} — give them a task.`;
    logEl.appendChild(e);
    return;
  }
  for (const m of s.messages) appendNode(m);
  if (s.pendingInput) logEl.appendChild(buildInputCard(s));
  logEl.scrollTop = logEl.scrollHeight;
}
