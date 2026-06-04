// Entry point: load the variant list, build the sidebar, open a socket per variant.
// The bare imports below pull in modules that self-wire their DOM listeners on load.
import type { VariantMeta } from "../protocol.js";
import { variantsEl } from "./dom.js";
import { connect } from "./socket.js";
import { sessions } from "./state.js";
import { selectVariant } from "./ui/sidebar.js";
import "./markdown.js";
import "./ui/attachments.js";
import "./ui/composer.js";
import "./ui/notifications.js";
import "./ui/modal.js";

if (Notification.permission === "default") Notification.requestPermission();

fetch("/variants")
  .then((r) => r.json())
  .then((list: VariantMeta[]) => {
    list.forEach((v, i) => {
      sessions[v.id] = {
        meta: v,
        ws: null,
        working: false,
        hasDone: false,
        lastProgress: null,
        live: false,
        streaming: null,
        messages: [],
        pendingInput: null,
      };

      const node = document.createElement("div");
      node.className = "variant";
      node.dataset.id = v.id;
      node.innerHTML =
        `<img src="${v.avatar}" alt="${v.name}" />` +
        `<div class="meta"><div class="name">${v.name}</div>` +
        `<div class="state"><span class="sdot"></span><span>offline</span></div></div>`;
      node.addEventListener("click", () => selectVariant(v.id));
      variantsEl.appendChild(node);

      connect(v);
      if (i === 0) selectVariant(v.id);
    });
  });
