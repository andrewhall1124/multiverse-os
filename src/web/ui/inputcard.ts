// Renders the structured-input card (an INPUT_REQUEST: text/choice prompt) and sends the
// user's answer back over the socket.
import { ui, type Session } from "../state.js";
import { renderLog } from "../render/log.js";
import { setWorking } from "./composer.js";

export function buildInputCard(s: Session): HTMLElement {
  const card = document.createElement("div");
  card.className = "input-card";

  const prompt = document.createElement("div");
  prompt.className = "input-card-prompt";
  prompt.textContent = s.pendingInput!.prompt;
  card.appendChild(prompt);

  if (s.pendingInput!.expected === "choice") {
    const choices = document.createElement("div");
    choices.className = "input-card-choices";
    for (const opt of s.pendingInput!.options ?? []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => submitInputResponse(s, opt));
      choices.appendChild(btn);
    }
    card.appendChild(choices);
  } else {
    const row = document.createElement("div");
    row.className = "input-card-text-row";
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "input-card-text";
    textInput.placeholder = "Type your answer…";
    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.textContent = "Submit";
    submitBtn.addEventListener("click", () => {
      const val = textInput.value.trim();
      if (val) submitInputResponse(s, val);
    });
    textInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        const val = textInput.value.trim();
        if (val) submitInputResponse(s, val);
      }
    });
    row.appendChild(textInput);
    row.appendChild(submitBtn);
    card.appendChild(row);
    setTimeout(() => textInput.focus(), 50);
  }
  return card;
}

export function submitInputResponse(s: Session, response: string) {
  if (!s.ws || s.ws.readyState !== WebSocket.OPEN) return;
  s.pendingInput = null;
  s.messages.push({ who: "me", text: response });
  setWorking(s.meta.id, true);
  s.ws.send(JSON.stringify({ kind: "input_response", response }));
  if (ui.activeId === s.meta.id) renderLog();
}
