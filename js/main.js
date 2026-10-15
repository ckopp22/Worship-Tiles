// Boot, screen router, stage scaling.

import { state } from "./state.js";
import { installUnlockOnFirstTap, startMenuMusic, stopMenuMusic } from "./audio.js";
import * as menu from "./screens/menu.js";
import * as howto from "./screens/howto.js";
import * as library from "./screens/library.js";
import * as store from "./screens/store.js";
import * as settings from "./screens/settings.js";
import * as results from "./screens/results.js";
import * as calibrate from "./screens/calibrate.js";
import * as game from "./game/game.js";

const MUSIC_SCREENS = new Set(["menu", "howto", "library", "store", "settings"]); // menu music plays here
const stage = document.getElementById("stage");
const screens = {};
let current = null;

/** Show one screen, hide the rest. Screen modules may export enter(data) and leave(). */
export function go(name, data) {
  if (!screens[name]) return;
  if (current) {
    screens[current].el.classList.remove("is-active");
    screens[current].mod?.leave?.();
  }
  current = name;
  screens[name].el.classList.add("is-active");
  if (MUSIC_SCREENS.has(name)) startMenuMusic(); else stopMenuMusic();
  screens[name].mod?.enter?.(data);
}

const app = { go };

const modules = { menu, howto, library, store, settings, results, calibrate, gameplay: game };
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
