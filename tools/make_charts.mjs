// Generates the Easy / Normal / Hard charts for Amazing Grace from the MIDI note timings.
//   node tools/make_charts.mjs
// Reads  tools/data/amazing-grace.notes.json
// Writes songs/charts/amazing-grace-{easy,normal,hard}.json (MDD 6.4 format, times in MP3 seconds).
// Deterministic: the same input always gives the same charts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SONG_ID = "amazing-grace";

// ---- tunables ----
const BPM = 90;
const BEAT = 60 / BPM;          // 0.667 s
const BAR = BEAT * 3;           // 3/4 time -> 2.0 s
const PHRASE = BAR * 4;         // phrases are 4 bars (8 s); phrase-ending notes land on these boundaries
const HOLD_MIN = 1.3;           // notes at least this long become holds
const HOLD_TRIM = 0.1;          // hold duration = note length - this
const DOUBLE_GAP = 0.5;         // consecutive short notes closer than this (same pitch or lane) -> one doubleTap
const LONG_NOTE = 2.0;          // notes this long always count as phrase endings
const NORMAL_DOUBLE_EVERY = 3;  // Normal: every Nth eligible eighth pair becomes a doubleTap, the rest drop the off-beat note

// Seconds to add to MIDI times to get MP3 times. notes.json says leadInSeconds = 0.5, but the MP3 has NO
// 0.5 s lead-in: measured in the decoded audio, the first sound lands ~0.04 s after the first MIDI note
// (1.33 s), and later notes follow the MIDI times the same way. Re-measure if the MP3 is re-rendered.
const AUDIO_OFFSET = 0.04;

const round3 = (x) => Math.round(x * 1000) / 1000;
const near = (a, b, tol = 0.05) => Math.abs(a - b) < tol;

// ---- load ----
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/data/amazing-grace.notes.json"), "utf8"));
const lead = AUDIO_OFFSET;
if (data.leadInSeconds !== lead) {
  console.warn(`Note: notes.json leadInSeconds is ${data.leadInSeconds}; using measured AUDIO_OFFSET ${lead} instead.`);
}
const tracks = data.tracks.filter((t) => t.notes.length);
const melodyTrack = tracks.find((t) => t.name === "Melody");
const harmonyTracks = tracks
  .filter((t) => t !== melodyTrack)
  .sort((a, b) => avgPitch(b) - avgPitch(a)); // upper harmony first, then lower
function avgPitch(t) { return t.notes.reduce((s, n) => s + n.pitch, 0) / t.notes.length; }
const range = (t) => ({ lo: Math.min(...t.notes.map((n) => n.pitch)), hi: Math.max(...t.notes.map((n) => n.pitch)) });

/** Split a track's pitch range into four equal bands -> lane 0 (low) to 3 (high). */
function laneFor(pitch, { lo, hi }) {
  const band = (hi - lo + 1) / 4;
  return Math.min(3, Math.floor((pitch - lo) / band));
}

const melodyRange = range(melodyTrack);
const harmonyRanges = harmonyTracks.map(range);

const melody = melodyTrack.notes
  .slice()
  .sort((a, b) => a.start - b.start)
  .map((n, i) => ({
    i,
    midiStart: n.start,
    time: round3(n.start + lead), // MP3 time
    len: n.end - n.start,
    pitch: n.pitch,
    lane: laneFor(n.pitch, melodyRange),
  }));

const lastIndex = melody.length - 1;
const onBeat = (n) => near(n.midiStart / BEAT, Math.round(n.midiStart / BEAT));
const onDownbeat = (n) => near(n.midiStart / BAR, Math.round(n.midiStart / BAR));
const isLong = (n) => n.len >= HOLD_MIN;
const isPhraseEnd = (n) =>
  isLong(n) && (n.i === lastIndex || n.len >= LONG_NOTE || near(n.midiStart / PHRASE, Math.round(n.midiStart / PHRASE)));

/** Lane of the harmony note sounding at this note's start (upper harmony first); never equals `avoid`. */
function harmonyLane(n) {
  for (let k = 0; k < harmonyTracks.length; k++) {
    const h = harmonyTracks[k].notes.find((x) => x.start <= n.midiStart + 0.01 && x.end > n.midiStart + 0.01);
    if (!h) continue;
    const lane = laneFor(h.pitch, harmonyRanges[k]);
    if (lane !== n.lane) return lane;
  }
  return n.lane < 3 ? n.lane + 1 : n.lane - 1; // fallback: neighbouring lane
}

/** Second lane for an adjacent-only chord (Easy): step from the melody lane toward the harmony lane. */
function adjacentLane(n) {
  const h = harmonyLane(n);
  const step = h > n.lane ? 1 : -1;
  return n.lane + step;
}

// ---- note builders ----
const tap = (n, lane = n.lane) => ({ time: n.time, lane, type: "tap" });
const hold = (n, lane = n.lane) => ({ time: n.time, lane, type: "hold", duration: round3(n.len - HOLD_TRIM) });
const double = (n) => ({ time: n.time, lane: n.lane, type: "doubleTap" });
const chord = (n, second, withHold) => {
  const note = { time: n.time, lanes: [n.lane, second], type: "chord" };
  if (withHold) note.duration = round3(n.len - HOLD_TRIM);
  return note;
};

const isEighthPair = (n, next) =>
  next && !isLong(n) && next.time - n.time < DOUBLE_GAP && (next.pitch === n.pitch || next.lane === n.lane);

// ---- difficulties ----
function buildHard() {
  const out = [];
  for (let i = 0; i < melody.length; i++) {
    const n = melody[i];
    if (isEighthPair(n, melody[i + 1])) { out.push(double(n)); i++; continue; }
    if (isPhraseEnd(n)) out.push(chord(n, harmonyLane(n), true));
    else if (isLong(n)) out.push(hold(n));
    else out.push(tap(n));
  }
  return out;
}

function buildNormal() {
  const out = [];
  let pairs = 0;
  for (let i = 0; i < melody.length; i++) {
    const n = melody[i];
    if (!onBeat(n)) continue; // off-beat eighths are dropped (handled below when paired)
    const next = melody[i + 1];
    if (next && !onBeat(next) && isEighthPair(n, next)) {
      if (pairs++ % NORMAL_DOUBLE_EVERY === 0) out.push(double(n)); else out.push(tap(n));
      continue;
    }
    if (isPhraseEnd(n)) {
      // tap chords on phrase endings; the final note is the occasional hold chord
      out.push(n.i === lastIndex ? chord(n, harmonyLane(n), true) : chord(n, harmonyLane(n), false));
    } else if (isLong(n)) out.push(hold(n));
    else out.push(tap(n));
  }
  return out;
}

function buildEasy() {
  const downbeats = melody.filter(onDownbeat);
  const chordAt = new Set(); // a few tap chords: two bars before every other phrase ending
  for (let p = PHRASE; p <= PHRASE * 5; p += PHRASE * 2) chordAt.add(round3(p - BAR));
  const out = [];
  let prevLane = null;
  for (const n of downbeats) {
    // mostly adjacent-lane moves: step at most one lane from the previous note
    let lane = n.lane;
    if (prevLane !== null && Math.abs(lane - prevLane) > 1) lane = prevLane + Math.sign(lane - prevLane);
    const m = { ...n, lane };
    prevLane = lane;
    if (isPhraseEnd(n)) out.push(hold(m));
    else if (chordAt.has(round3(n.midiStart))) out.push(chord(m, adjacentLane(m), false));
    else out.push(tap(m));
  }
  return out;
}

// ---- write ----
const builders = { easy: buildEasy, normal: buildNormal, hard: buildHard };
fs.mkdirSync(path.join(ROOT, "songs/charts"), { recursive: true });
console.log(`Melody: ${melody.length} notes, pitch range ${melodyRange.lo}-${melodyRange.hi}, lead-in ${lead}s`);
for (const [difficulty, build] of Object.entries(builders)) {
  const notes = build().sort((a, b) => a.time - b.time);
  const chart = { songId: SONG_ID, difficulty, notes };
  const body = notes.map((n) => "    " + JSON.stringify(n)).join(",\n"); // one note per line
  const text = `{\n  "songId": "${SONG_ID}",\n  "difficulty": "${difficulty}",\n  "notes": [\n${body}\n  ]\n}\n`;
  fs.writeFileSync(path.join(ROOT, `songs/charts/${SONG_ID}-${difficulty}.json`), text);
  const counts = {};
  for (const n of notes) {
    const key = n.type === "chord" && n.duration ? "holdChord" : n.type;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log(`${difficulty.padEnd(6)} ${String(notes.length).padStart(3)} notes (${Math.round((notes.length / melody.length) * 100)}% of melody)`, counts);
}
