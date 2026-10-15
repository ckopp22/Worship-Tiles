// Boot, screen router, stage scaling.

import { state } from "./state.js";
import { installUnlockOnFirstTap } from "./audio.js";
import * as menu from "./screens/menu.js";
import * as howto from "./screens/howto.js";
import * as library from "./screens/library.js";
import * as store from "./screens/store.js";
import * as settings from "./screens/settings.js";
import * as results from "./screens/results.js";

const stage = document.getElementById("stage");
const screens = {};
let current = null;

/** Show one screen, hide the rest. Screen modules may export enter() to refresh on show. */
export function go(name) {
  if (!screens[name]) return;
  if (current) screens[current].el.classList.remove("is-active");
  current = name;
  screens[name].el.classList.add("is-active");
  screens[name].mod?.enter?.();
}

const app = { go };

// Screens without a module (gameplay arrives in Phase 3) still get registered.
const modules = { menu, howto, library, store, settings, results };
document.querySelectorAll("[data-screen]").forEach((el) => {
  const name = el.dataset.screen;
  screens[name] = { el, mod: modules[name] };
});
Object.values(screens).forEach((s) => s.mod?.init?.(app));

// Any element with data-go="screen" navigates there.
stage.addEventListener("click", (e) => {
  const target = e.target.closest("[data-go]");
  if (target) go(target.dataset.go);
});

// Scale all UI (sized in em) so the 390x720 design fits the stage.
function fit() {
  const scale = Math.min(stage.clientWidth / 390, stage.clientHeight / 720);
  stage.style.fontSize = `${16 * scale}px`;
}
new ResizeObserver(fit).observe(stage);
fit();

// Block page zoom gestures and the context menu (iOS Safari ignores user-scalable=no).
["gesturestart", "gesturechange", "gestureend", "contextmenu"].forEach((type) =>
  document.addEventListener(type, (e) => e.preventDefault())
);

installUnlockOnFirstTap();
navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict saved data

go(state.profile.hasSeenTutorial ? "menu" : "howto");
