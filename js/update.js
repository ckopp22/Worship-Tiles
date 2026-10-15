// Service worker registration and the "New version ready" banner.
// A new worker waits until the player taps the banner (then it takes over and the app reloads).
// The banner is hidden during a song, and a reload never happens mid-song.

const banner = document.getElementById("update-banner");
let waiting = null;        // the installed worker waiting to take over
let reloadWanted = false;  // the player tapped the banner
let reloading = false;
let busy = () => false;

const refresh = () => { banner.hidden = !waiting || busy(); };

function offer(worker) {
  waiting = worker;
  refresh();
}

function watch(worker) {
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker); // an update, not the first install
  });
}

function reloadIfIdle() {
  if (!reloadWanted || reloading || busy()) return;
  reloading = true;
  location.reload();
}

/** Call whenever the screen changes so the banner / pending reload can react. */
export function screenChanged() {
  refresh();
  reloadIfIdle();
}

/** isBusy() should return true while a song is being played. */
export async function initUpdates(isBusy) {
  busy = isBusy;
  if (!("serviceWorker" in navigator)) return;

  // While developing on localhost, a cache-first service worker would show stale files, so it only
  // runs there with ?sw=1. Without it, remove any old worker and our caches.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has("sw")) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("worship-tiles-")).map((k) => caches.delete(k)));
    return;
  }

  banner.addEventListener("click", () => {
    reloadWanted = true;
    waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  navigator.serviceWorker.addEventListener("controllerchange", reloadIfIdle);

  try {
    const reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }); // relative to the page (works in a subfolder); update checks skip the HTTP cache
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    if (reg.installing) watch(reg.installing);
    reg.addEventListener("updatefound", () => reg.installing && watch(reg.installing));
  } catch (err) {
    console.warn("Service worker registration failed:", err.message);
  }
}
