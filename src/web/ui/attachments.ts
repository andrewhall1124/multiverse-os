// Two kinds of attachment: uploaded files (sent to /upload, tracked per variant) and
// large pasted text (captured client-side as a "paste" chip). This module owns both,
// and self-wires the attach button, file input, and paste handler on load.
import { ui, pendingAttachments } from "../state.js";
import { attachBtn, fileInput, attachRow, attachmentsEl, input } from "../dom.js";

// ---- Uploaded files ----
export function getAttachments() {
  return (ui.activeId && pendingAttachments[ui.activeId]) || [];
}

export function renderAttachments() {
  const list = getAttachments();
  attachRow.innerHTML = "";
  attachRow.classList.toggle("visible", list.length > 0);
  list.forEach((a, i) => {
    const pill = document.createElement("div");
    pill.className = "attach-pill";
    const name = document.createElement("span");
    name.className = "pill-name";
    name.textContent = a.name;
    name.title = a.path;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "pill-remove";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", () => {
      getAttachments().splice(i, 1);
      renderAttachments();
    });
    pill.appendChild(name);
    pill.appendChild(rm);
    attachRow.appendChild(pill);
  });
}

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  fileInput.value = "";
  if (!files.length || !ui.activeId) return;

  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/upload?variant=${encodeURIComponent(ui.activeId)}`, { method: "POST", body: fd });
      if (!res.ok) {
        console.error("upload failed", await res.text());
        continue;
      }
      const data = await res.json();
      if (!pendingAttachments[ui.activeId]) pendingAttachments[ui.activeId] = [];
      pendingAttachments[ui.activeId].push(data);
      renderAttachments();
    } catch (err) {
      console.error("upload error", err);
    }
  }
});

// ---- Large pasted text ----
const PASTE_CHARS = 500;
const PASTE_LINES = 5;
let attachedPastes: { id: string; text: string }[] = [];

export function getPastes() {
  return attachedPastes;
}

export function addAttachment(text: string) {
  const id = Date.now().toString();
  attachedPastes.push({ id, text });
  const lines = (text.match(/\n/g) || []).length + 1;
  const label = `📄 Pasted text · ${text.length.toLocaleString()} chars, ${lines} line${lines === 1 ? "" : "s"}`;
  const chip = document.createElement("div");
  chip.className = "attachment";
  chip.dataset.id = id;
  const labelSpan = document.createElement("span");
  labelSpan.className = "attachment-label";
  labelSpan.textContent = label;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "attachment-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => removeAttachment(id));
  chip.appendChild(labelSpan);
  chip.appendChild(removeBtn);
  attachmentsEl.appendChild(chip);
  attachmentsEl.style.display = "flex";
}

export function removeAttachment(id: string) {
  attachedPastes = attachedPastes.filter((a) => a.id !== id);
  const chip = attachmentsEl.querySelector(`[data-id="${id}"]`);
  if (chip) chip.remove();
  if (attachmentsEl.children.length === 0) attachmentsEl.style.display = "none";
}

export function clearAttachments() {
  attachedPastes = [];
  attachmentsEl.innerHTML = "";
  attachmentsEl.style.display = "none";
}

input.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text/plain") ?? "";
  const lineCount = (text.match(/\n/g) || []).length;
  if (text.length > PASTE_CHARS || lineCount >= PASTE_LINES) {
    e.preventDefault();
    addAttachment(text);
  }
});
