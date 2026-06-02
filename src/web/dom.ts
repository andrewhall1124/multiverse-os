// Typed handles to the static elements in index.html's shell. Cached at module load,
// which is safe because module scripts run after the document is parsed.

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as T;
}

export const variantsEl = byId("variants");
export const logEl = byId("log");

export const hAvatar = byId<HTMLImageElement>("hAvatar");
export const hName = byId("hName");
export const hWorkdir = byId("hWorkdir");

export const form = byId<HTMLFormElement>("form");
export const input = byId<HTMLTextAreaElement>("input");
export const sendBtn = byId<HTMLButtonElement>("send");
export const attachBtn = byId<HTMLButtonElement>("attachBtn");
export const fileInput = byId<HTMLInputElement>("fileInput");
export const attachRow = byId("attachRow");
export const attachmentsEl = byId("attachments");

export const activityEl = byId("activity");
export const activityText = byId("activityText");

export const clearBtn = byId<HTMLButtonElement>("clearHistory");
export const modalOverlay = byId("modalOverlay");
export const modalBody = byId("modalBody");
export const modalCancel = byId<HTMLButtonElement>("modalCancel");
export const modalConfirm = byId<HTMLButtonElement>("modalConfirm");

export const settingsBtn = byId<HTMLButtonElement>("settingsBtn");
export const settingsOverlay = byId("settingsOverlay");
export const settingsClose = byId<HTMLButtonElement>("settingsClose");
export const notifStatusEl = byId("notifStatus");
export const requestNotifBtn = byId<HTMLButtonElement>("requestNotifBtn");
export const testNotifBtn = byId<HTMLButtonElement>("testNotifBtn");
