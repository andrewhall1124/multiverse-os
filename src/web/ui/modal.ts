// The "clear history" confirmation modal. Self-wires its triggers on load.

import { clearBtn, modalBody, modalCancel, modalConfirm, modalOverlay } from "../dom.js";
import { renderLog } from "../render/log.js";
import { connect } from "../socket.js";
import { sessions, ui } from "../state.js";

function closeModal() {
  modalOverlay.classList.remove("open");
}

clearBtn.addEventListener("click", () => {
  if (!ui.activeId) return;
  const name = sessions[ui.activeId]?.meta?.name ?? "this variant";
  modalBody.textContent = `This will permanently delete the chat history for ${name}. This can't be undone.`;
  modalOverlay.classList.add("open");
  modalCancel.focus();
});

modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

modalConfirm.addEventListener("click", async () => {
  closeModal();
  if (!ui.activeId) return;
  await fetch(`/history/${ui.activeId}`, { method: "DELETE" });
  const s = sessions[ui.activeId];
  s.messages = [];
  s.streaming = null;
  s.working = false;
  s.lastProgress = null;
  // Close and reopen the socket so the server spins up a fresh Variant with the now-empty
  // history — without this the old context lives on in the resumed session.
  s.ws?.close();
  connect(s.meta);
  renderLog();
});
