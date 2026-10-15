// Measures how well a song's charts sit on the beat grid and on the audio.   node tools/check_sync.mjs [song-id]
// 1. Grid: distance (ms) of every note start (and hold / hold-chord end) from the nearest beat subdivision.
// 2. Audio: decodes the mp3 (macOS afconvert, or ffmpeg if present), detects onsets, compares with melody times.
// Grid origin = beat 0 at chart time `gridOffset` (default: songs.json-independent 0 + AUDIO_OFFSET read from --origin).
//   node tools/check_sync.mjs amazing-grace [--origin=0.04]   (origin = chart time of beat 0)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode, onsetEnvelope, pickOnsets } from "./lib/audio_analysis.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SONG_ID = args.find((a) => !a.startsWith("--")) || "amazing-grace";
const originArg = args.find((a) => a.startsWith("--origin="));

const song = JSON.parse(fs.readFileSync(path.join(ROOT, "songs/songs.json"), "utf8")).songs.find((s) => s.id === SONG_ID);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, `tools/data/${SONG_ID}.notes.json`), "utf8"));
const BPM = song.bpm;
const BEAT = 60 / BPM;
// Chart time of beat 0. Default: what make_charts.mjs uses (audioOffsetSeconds, else its DEFAULT_AUDIO_OFFSET via the generator's export file).
const ORIGIN = originArg ? Number(originArg.split("=")[1]) : data.audioOffsetSeconds ?? readGeneratorOffset();
function readGeneratorOffset() {
  const src = fs.readFileSync(path.join(ROOT, "tools/make_charts.mjs"), "utf8");
  const m = /const (?:AUDIO_OFFSET_SECONDS|DEFAULT_AUDIO_OFFSET) = ([\d.]+)/.exec(src);
  return m ? Number(m[1]) : 0;
}
console.log(`${SONG_ID}: bpm ${BPM} (songs.json), beat ${(BEAT * 1000).toFixed(1)} ms, beat-0 origin ${ORIGIN} s`);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const ms = (x) => (x * 1000).toFixed(1);

// ---- 1. grid check ----
const SUB = { easy: 2, normal: 2, hard: 4 };
const charts = {};
for (const d of ["easy", "normal", "hard"]) {
  if (!song.charts[d]) continue;
  charts[d] = JSON.parse(fs.readFileSync(path.join(ROOT, song.charts[d]), "utf8")).notes;
}
const offGrid = (t, sub) => {
  const beats = (t - ORIGIN) / BEAT, snapped = Math.round(beats * sub) / sub;
  return (beats - snapped) * BEAT; // signed seconds
};
for (const [d, notes] of Object.entries(charts)) {
  const sub = SUB[d];
  const rows = [];
  for (const n of notes) {
    const lane = n.lanes ? n.lanes.join("+") : n.lane;
    rows.push({ kind: "start", t: n.time, lane, err: offGrid(n.time, sub) });
    if (n.duration) rows.push({ kind: "end", t: n.time + n.duration, lane, err: offGrid(n.time + n.duration, 2) }); // ends: beat or half beat
  }
  const report = (label, r) => {
    const abs = r.map((x) => Math.abs(x.err) * 1000);
    console.log(`  ${d.padEnd(6)} ${label.padEnd(6)} n=${String(r.length).padStart(3)}  <=10ms: ${abs.filter((x) => x <= 10).length}  <=25ms: ${abs.filter((x) => x <= 25).length}  >25ms: ${abs.filter((x) => x > 25).length}  median signed ${ms(median(r.map((x) => x.err)))} ms`);
  };
  report("starts", rows.filter((r) => r.kind === "start"));
  if (rows.some((r) => r.kind === "end")) report("ends", rows.filter((r) => r.kind === "end"));
  rows.sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 10)
    .forEach((r) => console.log(`      worst: ${r.kind.padEnd(5)} t=${r.t.toFixed(3)} lane ${r.lane}  off by ${ms(r.err)} ms`));
}

// ---- 2. audio onsets vs melody ----
const tmp = path.join(ROOT, song.audio);
const x = decode(tmp);
const env = onsetEnvelope(x);
const onsets = pickOnsets(env, { minGap: 0.1, sensitivity: 0.6 });
console.log(`\nAudio: ${(x.length / 22050).toFixed(2)} s decoded, ${onsets.length} onsets detected, first sound near ${onsets[0]?.time.toFixed(3)} s`);

const melody = data.tracks.find((t) => t.name === "Melody").notes;
const compare = (shift) => {
  const diffs = [];
  for (const m of melody) {
    const t = m.start + shift;
    let best = null;
    for (const o of onsets) if (Math.abs(o.time - t) < 0.15 && (!best || Math.abs(o.time - t) < Math.abs(best - t))) best = o.time;
    if (best !== null) diffs.push(best - t);
  }
  return diffs;
};
// Chart melody times = MIDI start + generator offset; compare audio onsets to those.
const diffs = compare(ORIGIN);
const med = median(diffs);
const dev = diffs.map((d) => Math.abs(d - med));
const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - med) ** 2, 0) / diffs.length);
console.log(`Melody notes matched to an audio onset (+-150 ms): ${diffs.length}/${melody.length}`);
console.log(`Onset minus chart time: median ${ms(med)} ms, spread (rms about median) ${ms(sd)} ms, p10 ${ms([...diffs].sort((a, b) => a - b)[Math.floor(diffs.length * 0.1)])} ms, p90 ${ms([...diffs].sort((a, b) => a - b)[Math.floor(diffs.length * 0.9)])} ms, worst |dev| ${ms(Math.max(...dev))} ms`);
// Also: the best global shift (MIDI->audio) over a fine sweep, using median diff vs raw MIDI times.
const raw = compare(0);
console.log(`Raw MIDI start (no offset) vs audio onsets: median ${ms(median(raw))} ms (that is the MIDI->MP3 delay incl. detector latency)`);
// Slope: does the offset drift with time? (least squares of diff vs time)
{
  const pts = [];
  for (const m of melody) {
    const t = m.start + ORIGIN;
    let best = null;
    for (const o of onsets) if (Math.abs(o.time - t) < 0.15 && (!best || Math.abs(o.time - t) < Math.abs(best - t))) best = o.time;
    if (best !== null) pts.push([t, best - t]);
  }
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  console.log(`Drift over the song: ${ms(slope * 60)} ms per minute`);
}
