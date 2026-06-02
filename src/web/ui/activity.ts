// The live "tool running" bar beneath the chat log.
import { activityEl, activityText } from "../dom.js";

export function updateActivity({ tool, summary }: { tool: string; summary: string }) {
  activityText.textContent = `${tool}: ${summary}`;
  activityEl.classList.add("visible");
}

export function clearActivity() {
  activityEl.classList.remove("visible");
}
