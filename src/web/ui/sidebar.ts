// The variant list: status dots, ordering, and selecting the active thread.
import { sessions, ui } from "../state.js";
import { variantsEl, hAvatar, hName, hWorkdir, input, attachBtn, clearBtn, sendBtn } from "../dom.js";
import { updateActivity, clearActivity } from "./activity.js";
import { renderLog } from "../render/log.js";
import { clearAttachments, renderAttachments } from "./attachments.js";

export function statusRank(id: string): number {
  const s = sessions[id];
  if (!s) return 4;
  if (s.working) return 0;
  if (s.hasDone) return 1;
  if (s.live) return 2;
  return 3;
}

export function sortSidebar() {
  const nodes = [...variantsEl.querySelectorAll<HTMLElement>(".variant")];
  nodes.sort((a, b) => statusRank(a.dataset.id!) - statusRank(b.dataset.id!));
  for (const n of nodes) variantsEl.appendChild(n);
}

export function setSidebarState(id: string) {
  const s = sessions[id];
  const node = document.querySelector<HTMLElement>(`.variant[data-id="${id}"]`);
  if (!node || !s) return;
  const dot = node.querySelector(".sdot");
  const label = s.working ? "working" : s.hasDone ? "done" : s.live ? "live" : "";
  if (dot) dot.className = "sdot " + label;
  const state = node.querySelector(".state");
  if (state && state.lastChild) {
    state.lastChild.textContent = s.working ? "working…" : s.hasDone ? "done" : s.live ? "online" : "offline";
  }
  sortSidebar();
}

export function selectVariant(id: string) {
  ui.activeId = id;
  document.querySelectorAll<HTMLElement>(".variant").forEach((n) => n.classList.toggle("active", n.dataset.id === id));
  const s = sessions[id];
  s.hasDone = false;
  setSidebarState(id);
  hAvatar.src = s.meta.avatar;
  hName.textContent = s.meta.name;
  hWorkdir.textContent = s.meta.workdir ? "working in: " + s.meta.workdir : "";
  input.disabled = false;
  attachBtn.disabled = false;
  clearBtn.disabled = false;
  if (s.working) {
    sendBtn.textContent = "Stop";
    sendBtn.classList.add("stop");
    sendBtn.disabled = !s.live;
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.remove("stop");
    sendBtn.disabled = !s.live;
  }
  if (s.working && s.lastProgress) updateActivity(s.lastProgress);
  else clearActivity();
  clearAttachments();
  input.focus();
  renderLog();
  renderAttachments();
}
