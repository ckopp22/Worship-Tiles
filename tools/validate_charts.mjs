// Validates every song's charts.   node tools/validate_charts.mjs [song-id]
// Checks: sorted by time, lanes 0-3, hold / chord durations, chords use two different lanes,
// no two notes in a lane overlap in time (holds included), nothing after the end of the audio.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { spawnSync } from "node:child_process";
const DOUBLE_TAP_SPAN = 0.25; // a doubleTap occupies its lane for the second-tap window

/** Duration of a CBR mp3 from its first frame header (no dependencies). */
function mp3Duration(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  if (buf.toString("latin1", 0, 3) === "ID3") pos = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  while (pos < buf.length - 4 && !(buf[pos] === 0xff && (buf[pos + 1] & 0xe0) === 0xe0)) pos++;
  const versionBits = (buf[pos + 1] >> 3) & 3, layerBits = (buf[pos + 1] >> 1) & 3, bitrateIdx = (buf[pos + 2] >> 4) & 15;
  const v1l3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const v2l3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const kbps = (versionBits === 3 ? v1l3 : v2l3)[bitrateIdx];
  if (layerBits !== 1 || !kbps) throw new Error("Unsupported mp3 header");
  return (buf.length - pos) / (kbps * 125);
}

/** Audio length in seconds: mp3 by header, anything else (m4a) through macOS afinfo. */
function audioDuration(file) {
  if (file.endsWith(".mp3")) return mp3Duration(file);
  const r = spawnSync("afinfo", [file]);
  const m = /estimated duration: ([\d.]+)/.exec(String(r.stdout));
  if (!m) throw new Error(`Can't read the length of ${file}`);
  return Number(m[1]);
}

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "songs/songs.json"), "utf8")).songs;
const only = process.argv[2];
const songs = catalog.filter((s) => s.charts && (!only || s.id === only));
let failed = false;

for (const song of songs) {
  const SONG_ID = song.id;
  const total = audioDuration(path.join(ROOT, song.audio));
  console.log(`${SONG_ID}: audio ${total.toFixed(2)} s`);
  for (const difficulty of ["easy", "normal", "hard"]) {
    if (validate(SONG_ID, difficulty, total, path.join(ROOT, song.charts[difficulty]))) failed = true;
  }
}
process.exit(failed ? 1 : 0);

function validate(SONG_ID, difficulty, audioDuration, file) {
  const errors = [];
  const chart = JSON.parse(fs.readFileSync(file, "utf8"));
  const err = (i, msg) => errors.push(`note ${i} (${JSON.stringify(chart.notes[i])}): ${msg}`);
  const intervals = [[], [], [], []]; // per lane: [start, end, noteIndex]
  const isLane = (l) => Number.isInteger(l) && l >= 0 && l <= 3;
  if (chart.songId !== SONG_ID || chart.difficulty !== difficulty) errors.push("songId or difficulty doesn't match the file");

  chart.notes.forEach((n, i) => {
    if (i > 0 && n.time < chart.notes[i - 1].time) err(i, "not sorted by time");
    if (!(n.time >= 0)) err(i, "bad time");
    let lanes;
    if (n.type === "chord") {
      lanes = n.lanes;
      if (!Array.isArray(lanes) || lanes.length !== 2 || !lanes.every(isLane) || lanes[0] === lanes[1]) { err(i, "chord needs two different lanes 0-3"); return; }
      if ("lane" in n) err(i, "chord must use lanes, not lane");
      if ("duration" in n && !(n.duration > 0)) err(i, "chord duration must be > 0 when present");
    } else if (["tap", "hold", "doubleTap"].includes(n.type)) {
      if (!isLane(n.lane)) { err(i, "lane must be 0-3"); return; }
      lanes = [n.lane];
      if (n.type === "hold" && !(n.duration > 0)) err(i, "hold needs duration > 0");
      if (n.type !== "hold" && "duration" in n) err(i, "only holds and hold chords take a duration");
    } else { err(i, "unknown type"); return; }

    const span = n.duration ?? (n.type === "doubleTap" ? DOUBLE_TAP_SPAN : 0);
    if (n.time + (n.duration ?? 0) > audioDuration) err(i, "ends after the audio");
    for (const lane of lanes) {
      for (const [s, e, j] of intervals[lane]) {
        if (n.time < e && s < n.time + span || n.time === s) err(i, `overlaps note ${j} in lane ${lane}`);
      }
      intervals[lane].push([n.time, n.time + span, i]);
    }
  });

  console.log(`  ${difficulty.padEnd(6)} ${chart.notes.length} notes: ${errors.length ? "FAIL" : "ok"}`);
  errors.slice(0, 10).forEach((e) => console.log("    - " + e));
  return errors.length > 0;
}
