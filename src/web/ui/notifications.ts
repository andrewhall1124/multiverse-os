// Desktop notifications + the settings modal that manages permission. Self-wires its
// buttons on load.
import {
  settingsBtn,
  settingsOverlay,
  settingsClose,
  notifStatusEl,
  requestNotifBtn,
  testNotifBtn,
} from "../dom.js";

export function notify(title: string, body: string, avatar?: string, variantId?: string) {
  if (Notification.permission !== "granted") return;
  const icon = avatar ? window.location.origin + avatar : undefined;
  try {
    new Notification(title, { body, icon, tag: variantId, silent: false });
  } catch {
    /* notifications can throw on some platforms; ignore */
  }
}

function updateNotifStatus() {
  const perm = Notification.permission;
  notifStatusEl.textContent =
    perm === "granted"
      ? "Notifications are enabled."
      : perm === "denied"
        ? "Notifications are blocked. Enable them in your browser settings."
        : "Notifications have not been enabled yet.";
  requestNotifBtn.style.display = perm === "default" ? "" : "none";
  testNotifBtn.disabled = perm !== "granted";
}

function openSettings() {
  updateNotifStatus();
  settingsOverlay.classList.add("open");
}
function closeSettings() {
  settingsOverlay.classList.remove("open");
}

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

requestNotifBtn.addEventListener("click", async () => {
  await Notification.requestPermission();
  updateNotifStatus();
});

testNotifBtn.addEventListener("click", () => {
  try {
    new Notification("multiverse-os", {
      body: "Notifications are working! 🎉",
      icon: window.location.origin + "/logo.svg",
      silent: false,
    });
  } catch {
    /* ignore */
  }
});
