// The message composer: send / stop button state, interrupt, and submit (with pasted-text
// and uploaded-file folding). Self-wires the form, Enter-to-send, and textarea autosize.

import { form, input, sendBtn } from "../dom.js";
import { appendNode } from "../render/log.js";
import { pendingAttachments, sessions, ui } from "../state.js";
import { clearAttachments, getAttachments, getPastes, renderAttachments } from "./attachments.js";
import { setSidebarState } from "./sidebar.js";

export function setWorking(id: string, working: boolean) {
  const s = sessions[id];
  if (!s) return;
  s.working = working;
  setSidebarState(id);
  if (id !== ui.activeId) return;
  if (working) {
    sendBtn.textContent = "Stop";
    sendBtn.classList.add("stop");
    sendBtn.disabled = false;
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.remove("stop");
    sendBtn.disabled = !s.live;
  }
}

export function interrupt() {
  const s = ui.activeId ? sessions[ui.activeId] : null;
  if (!s?.live || !s.ws || s.ws.readyState !== WebSocket.OPEN) return;
  sendBtn.disabled = true;
  s.ws.send(JSON.stringify({ kind: "interrupt" }));
}

export function submit() {
  const s = ui.activeId ? sessions[ui.activeId] : null;
  if (s?.working) {
    interrupt();
    return;
  }
  let text = input.value.trim();
  const attachments = getAttachments();
  const pastes = getPastes();
  if (
    !s ||
    (!text && !attachments.length && !pastes.length) ||
    !s.live ||
    !s.ws ||
    s.ws.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  if (pastes.length > 0) {
    const pasteBlocks = pastes
      .map((a, i) =>
        pastes.length === 1 ? `[Pasted text:\n${a.text}]` : `[Pasted text ${i + 1}:\n${a.text}]`,
      )
      .join("\n\n");
    text = text ? `${pasteBlocks}\n\n${text}` : pasteBlocks;
  }

  if (attachments.length > 0) {
    const fileList = attachments.map((a) => a.path).join("\n");
    const note = `[Attached files — available in your workdir:\n${fileList}]`;
    text = text ? `${note}\n\n${text}` : note;
    pendingAttachments[ui.activeId!] = [];
    renderAttachments();
  }

  s.messages.push({ who: "me", text });
  appendNode({ who: "me", text });
  s.ws.send(text);
  setWorking(ui.activeId!, true);
  input.value = "";
  input.style.height = "auto";
  clearAttachments();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});
