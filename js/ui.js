// Small shared UI helpers: a confirm dialog and the dev Bank shortcut.

import { addToBank } from "./state.js";

const dialog = () => document.getElementById("dialog");
let pendingResolve = null;

/** Show the confirm dialog. Resolves true on confirm, false on cancel or backdrop tap. */
export function confirmDialog({ title, message = "", confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  if (pendingResolve) pendingResolve(false);
  const el = dialog();
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-message").textContent = message;
  const ok = document.getElementById("dialog-ok");
  const cancel = document.getElementById("dialog-cancel");
  ok.textContent = confirmLabel;
  cancel.textContent = cancelLabel;
  el.hidden = false;
  ok.focus();
  return new Promise((resolve) => {
    const done = (value) => {
      el.hidden = true;
      ok.onclick = cancel.onclick = el.onclick = null;
      pendingResolve = null;
      resolve(value);
    };
    pendingResolve = done;
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    el.onclick = (e) => { if (e.target === el) done(false); };
  });
}

// DEV ONLY: with ?dev=1 in the URL, tap a Bank balance 5 times quickly for +1000 coins.
// Without ?dev=1 (the normal case) this does nothing.
export function attachDevBankShortcut(el) {
  if (!new URLSearchParams(location.search).has("dev")) return;
  let taps = 0, last = 0;
  el.addEventListener("click", () => {
    const now = performance.now();
    taps = now - last < 1500 ? taps + 1 : 1;
    last = now;
    if (taps >= 5) { taps = 0; addToBank(1000); }
  });
}
