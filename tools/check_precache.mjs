// Checks that sw.js precaches every file the app needs.   node tools/check_precache.mjs
// Fails if a shipped file is missing from the PRECACHE list, or the list names a file that doesn't exist.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const list = sw.slice(sw.indexOf("const PRECACHE = ["), sw.indexOf("];", sw.indexOf("const PRECACHE = [")));
const listed = new Set([...list.matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]).filter((p) => p !== "./"));

const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const needed = new Set(["index.html", "manifest.webmanifest", ...walk("css"), ...walk("js"), ...walk("icons")]);

// song files named in songs.json for songs that are free (price 0) and not placeholders
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "songs/songs.json"), "utf8"));
needed.add("songs/songs.json");
for (const s of catalog.songs.filter((x) => x.price === 0 && x.audio)) {
  needed.add(s.audio);
  Object.values(s.charts).forEach((c) => needed.add(c));
}

const missing = [...needed].filter((f) => !listed.has(f));
const extra = [...listed].filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) console.log("Not precached:", missing);
if (extra.length) console.log("Listed but missing on disk:", extra);
console.log(missing.length || extra.length ? "FAIL" : `ok (${listed.size} files precached)`);
process.exit(missing.length || extra.length ? 1 : 0);
