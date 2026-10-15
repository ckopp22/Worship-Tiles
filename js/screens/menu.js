// Main Menu: bank balance and sound toggle. Navigation is handled by data-go in main.js.

import { state, subscribe, setSetting } from "../state.js";
import { unlock } from "../audio.js";
import { attachDevBankShortcut } from "../ui.js";

const bankEl = document.getElementById("bank-amount");
const soundBtn = document.getElementById("sound-toggle");

function render() {
  bankEl.textContent = state.profile.bank.toLocaleString();
  const on = state.settings.soundEnabled;
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
}

export function init() {
  soundBtn.addEventListener("click", () => {
    unlock();
    setSetting("soundEnabled", !state.settings.soundEnabled);
  });
  attachDevBankShortcut(document.querySelector(".bank")); // DEV shortcut
  subscribe(render);
  render();
}

export const enter = render;
