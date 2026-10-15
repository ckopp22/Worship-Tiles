// Service worker: offline support for the app shell and songs.
// Everything is cached in one versioned cache named from js/version.js; bumping the version installs a
// fresh cache, and activation deletes the old ones. Files are served cache-first, so ALWAYS bump the
// version when you change any file.
// After editing this list, run: node tools/check_precache.mjs

importScripts("js/version.js"); // defines self.WT_VERSION

const CACHE_PREFIX = "worship-tiles-";
const CACHE = `${CACHE_PREFIX}v${self.WT_VERSION}`;

// Paths are relative to this file, so the app works from a GitHub Pages project subfolder.
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/audio.js",
  "js/game/conductor.js",
  "js/game/difficulty.js",
  "js/game/game.js",
  "js/game/input.js",
  "js/game/judge.js",
  "js/game/notes.js",
  "js/game/renderer.js",
  "js/haptics.js",
  "js/main.js",
  "js/screens/calibrate.js",
  "js/screens/howto.js",
  "js/screens/library.js",
  "js/screens/menu.js",
  "js/screens/results.js",
  "js/screens/settings.js",
  "js/screens/store.js",
  "js/songs.js",
  "js/state.js",
  "js/testsong.js",
  "js/ui.js",
  "js/update.js",
  "js/version.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "songs/songs.json",
  // free starter songs, so the game works offline from the first visit
  "songs/audio/amazing-grace.mp3",
  "songs/charts/amazing-grace-easy.json",
  "songs/charts/amazing-grace-normal.json",
  "songs/charts/amazing-grace-hard.json",
  "songs/charts/amazing-grace-expert.json",
  "songs/audio/rock-of-ages.mp3", // second free starter
  "songs/charts/rock-of-ages-easy.json",
  "songs/charts/rock-of-ages-normal.json",
  "songs/charts/rock-of-ages-hard.json",
  "songs/charts/rock-of-ages-expert.json",
];

self.addEventListener("install", (event) => {
  // 'reload' skips the browser's HTTP cache so a new version never precaches stale files.
  // No skipWaiting here: the page asks for it when the player taps the update banner.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((p) => new Request(new URL(p, self.registration.scope), { cache: "reload" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(respond(req));
});

async function respond(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true }); // ?dev=1 / ?sw=1 still hit the cached page

  // Range requests (media elements, Safari): always answer with a 206 cut from the complete file.
  if (req.headers.has("range")) {
    let full = hit;
    if (!full) {
      full = await fetch(req.url); // fetch the whole file (no Range header) and keep it for next time
      if (full.ok) await cache.put(req.url, full.clone());
    }
    return full.ok ? rangeResponse(full, req.headers.get("range")) : full;
  }

  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) await cache.put(req, res.clone()); // runtime cache: songs played once work offline
    return res;
  } catch (err) {
    if (req.mode === "navigate") {
      const page = await cache.match("index.html", { ignoreSearch: true });
      if (page) return page;
    }
    throw err;
  }
}

/** Build a 206 Partial Content response for "bytes=start-end" (or "bytes=-suffix") from a full response. */
async function rangeResponse(full, header) {
  const data = await full.clone().arrayBuffer();
  const total = data.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  let start, end;
  if (m[1] === "") { start = Math.max(0, total - Number(m[2])); end = total - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1); }
  if (start > end || start >= total) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  return new Response(data.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
