// A persisted tool invocation: name + summary, with its output behind a disclosure.
import type { ToolItem } from "../state.js";

export function buildToolChip(m: ToolItem): HTMLElement {
  const el = document.createElement("div");
  el.className = `toolchip${m.isError ? " err" : ""}`;
  if (m.toolUseId) el.dataset.toolId = m.toolUseId;

  const head = document.createElement("div");
  head.className = "thead";
  const name = document.createElement("span");
  name.className = "tname";
  name.textContent = m.tool;
  const sum = document.createElement("span");
  sum.className = "tsum";
  sum.textContent = m.summary || "";
  head.appendChild(name);
  head.appendChild(sum);

  const hasOutput = m.output != null && m.output !== "";
  if (hasOutput) {
    const det = document.createElement("details");
    const summary = document.createElement("summary");
    summary.appendChild(head);
    const pre = document.createElement("pre");
    pre.textContent = m.output;
    det.appendChild(summary);
    det.appendChild(pre);
    el.appendChild(det);
  } else {
    if (m.running) {
      const dot = document.createElement("span");
      dot.className = "tdot";
      dot.textContent = "…";
      head.appendChild(dot);
    }
    el.appendChild(head);
  }
  return el;
}
