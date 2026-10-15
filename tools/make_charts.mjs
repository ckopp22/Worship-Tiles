// Generates the Easy / Normal / Hard charts for a song from its note timings.
//   node tools/make_charts.mjs [song-id]        (default: amazing-grace)
// Reads  tools/data/<id>.notes.json   (MIDI-derived, or estimated from audio by tools/analyze_song.mjs)
// Writes songs/charts/<id>-{easy,normal,hard}.json (MDD 6.4 format, times in seconds of the shipped audio).
// Deterministic: the same input always gives the same charts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SONG_ID = process.argv[2] || "amazing-grace";

// ---- tunables ----
const HOLD_MIN = 1.3;           // notes at least this long become holds
const HOLD_TRIM = 0.1;          // hold duration = note length - this
const DOUBLE_GAP = 0.5;         // consecutive short notes closer than this (same pitch or lane) -> one doubleTap
const LONG_NOTE = 2.0;          // notes this long always count as phrase endings
const EXPERT_CHORD_EVERY = 5;   // Expert: every Nth plain melody note becomes a two-finger chord
const EXPERT_SPLIT_GAP = 0.55;  // Expert: melody gaps at least this long get an extra off-beat tap halfway
const EXPERT_MIN_GAP = 0.2;     // Expert: harmony taps are only added at least this far (seconds) from every other note
const NORMAL_DOUBLE_EVERY = 3;  // Normal: every Nth eligible eighth pair becomes a doubleTap, the rest drop the off-beat note
// Seconds to add to MIDI times to get MP3 times, for MIDI-derived songs only. Amazing Grace's notes.json says
// leadInSeconds = 0.5, but the MP3 has NO 0.5 s lead-in: tools/check_sync.mjs measures the first sound ~0.04 s after
// the first MIDI note (1.33 s), steady across the song (spread ~3 ms, no drift). Audio-derived songs are measured on
// the shipped audio and set audioOffsetSeconds = 0 instead. This one constant is applied to every note.
const AUDIO_OFFSET_SECONDS = 0.04;
const RELEASE_GAP = 0.1;        // a hold must end at least this long before the next note in any of its lanes

const round3 = (x) => Math.round(x * 1000) / 1000;
const near = (a, b, tol = 0.05) => Math.abs(a - b) < tol;

// ---- load ----
const data = JSON.parse(fs.readFileSync(path.join(ROOT, `tools/data/${SONG_ID}.notes.json`), "utf8"));
const lead = data.audioOffsetSeconds ?? AUDIO_OFFSET_SECONDS;
if (data.leadInSeconds !== undefined && data.leadInSeconds !== lead && data.audioOffsetSeconds === undefined) {
  console.warn(`Note: notes.json leadInSeconds is ${data.leadInSeconds}; using measured audio offset ${lead} instead.`);
}
const BPM = data.bpm ?? 90;
const BEAT = 60 / BPM;
// MIDI-derived songs sit exactly on the beat grid: every start / end is snapped to a beat subdivision.
// Audio-derived songs (source "audio-onsets") keep their measured times.
const MIDI_GRID = data.source !== "audio-onsets";
let SUB = 2; // subdivisions per beat for the difficulty being built (2 = half beat, 4 = quarter beat)
/** Snap a chart time (seconds of the shipped audio) to the nearest 1/sub beat, converted back to seconds. */
const snap = (t, sub = SUB) => (MIDI_GRID ? round3(lead + (Math.round(((t - lead) / BEAT) * sub) / sub) * BEAT) : t);
/** Hold length: start and end both snapped (end to a beat or half beat); audio-derived songs keep the old trim. */
const holdLen = (n) => (MIDI_GRID ? round3(snap(n.time + n.len, 2) - snap(n.time)) : round3(n.len - HOLD_TRIM));
const BEATS_PER_BAR = data.beatsPerBar ?? 3;
const BAR = BEAT * BEATS_PER_BAR;
const PHRASE = BAR * 4;                   // phrases are 4 bars; used for phrase endings when phraseGrid is on
const GRID_ORIGIN = data.gridOrigin ?? 0; // time of a downbeat
const BEAT_TOL = data.beatTolerance ?? 0.05; // how close to the grid counts as "on the beat" (in beats)
const PHRASE_GRID = data.phraseGrid ?? true;
const PITCH_PERCENTILE = data.rangePercentile ?? false; // ignore octave slips when banding pitches into lanes
const DOUBLE_SPACING = data.doubleSpacing ?? 0;         // Hard: at most one doubleTap per this many chart notes (0 = no limit)
const QUANTILE_BANDS = data.laneBands === "quantile";   // lanes hold equal shares of the notes instead of equal pitch widths
const NORMAL_SUBDIVISION = data.normalSubdivision ?? 1; // Normal keeps notes on the beat (1) or on beats and half-beats (2)
const NORMAL_TARGET = data.normalTarget ?? 0;           // Normal: thin the weakest plain notes down to this share of the source (0 = off)

const tracks = data.tracks.filter((t) => t.notes.length);
const melodyTrack = tracks.find((t) => t.name === "Melody");
const harmonyTracks = tracks
  .filter((t) => t !== melodyTrack)
  .sort((a, b) => avgPitch(b) - avgPitch(a)); // upper harmony first, then lower
function avgPitch(t) { return t.notes.reduce((s, n) => s + n.pitch, 0) / t.notes.length; }
function range(t) {
  const p = t.notes.map((n) => n.pitch).sort((a, b) => a - b);
  if (QUANTILE_BANDS && t === melodyTrack) {
    const cut = (f) => p[Math.min(p.length - 1, Math.floor(p.length * f))];
    return { lo: p[0], hi: p[p.length - 1], cuts: [cut(0.25), cut(0.5), cut(0.75)] };
  }
  if (!PITCH_PERCENTILE) return { lo: p[0], hi: p[p.length - 1] };
  return { lo: p[Math.floor(p.length * 0.04)], hi: p[Math.ceil(p.length * 0.96) - 1] };
}

/** Split a track's pitch range into four equal bands -> lane 0 (low) to 3 (high). */
function laneFor(pitch, { lo, hi, cuts }) {
  if (cuts) return cuts.filter((c) => pitch >= c).length; // pitch at or above a cut moves up a lane
  const band = (hi - lo + 1) / 4;
  return Math.max(0, Math.min(3, Math.floor((pitch - lo) / band)));
}

const melodyRange = range(melodyTrack);
const harmonyRanges = harmonyTracks.map(range);

const melody = melodyTrack.notes
  .slice()
  .sort((a, b) => a.start - b.start)
  .map((n, i) => ({
    i,
    midiStart: n.start,
    time: round3(n.start + lead), // time in the shipped audio
    len: n.end - n.start,
    pitch: n.pitch,
    vel: n.vel,
    lane: laneFor(n.pitch, melodyRange),
  }));

const lastIndex = melody.length - 1;
const onGrid = (n, every) => near((n.midiStart - GRID_ORIGIN) / (BEAT * every), Math.round((n.midiStart - GRID_ORIGIN) / (BEAT * every)), BEAT_TOL / every);
const onBeat = (n) => onGrid(n, 1);
// Normal's grid: for dense accompaniment-style songs the half-beat counts as "on the beat" too.
const onNormalGrid = (n) => (NORMAL_SUBDIVISION === 1 ? onBeat(n) : near((n.midiStart - GRID_ORIGIN) / (BEAT / NORMAL_SUBDIVISION), Math.round((n.midiStart - GRID_ORIGIN) / (BEAT / NORMAL_SUBDIVISION)), 0.12 * NORMAL_SUBDIVISION));
const isLong = (n) => n.len >= HOLD_MIN;
const isPhraseEnd = (n) =>
  isLong(n) && (n.i === lastIndex || n.len >= LONG_NOTE || (PHRASE_GRID && near(n.midiStart / PHRASE, Math.round(n.midiStart / PHRASE))));

/** Lane of the harmony note sounding at this note's start (upper harmony first); never equals the melody lane. */
function harmonyLane(n) {
  for (let k = 0; k < harmonyTracks.length; k++) {
    const h = harmonyTracks[k].notes.find((x) => x.start <= n.midiStart + 0.01 && x.end > n.midiStart + 0.01);
    if (!h) continue;
    const lane = laneFor(h.pitch, harmonyRanges[k]);
    if (lane !== n.lane) return lane;
  }
  return n.lane < 3 ? n.lane + 1 : n.lane - 1; // no harmony data: use the neighbouring lane
}

/** Second lane for an adjacent-only chord (Easy): step from the melody lane toward the harmony lane. */
function adjacentLane(n) {
  const h = harmonyLane(n);
  return n.lane + (h > n.lane ? 1 : -1);
}

// ---- note builders ----
const tap = (n, lane = n.lane) => ({ time: snap(n.time), lane, type: "tap" });
const hold = (n, lane = n.lane) => ({ time: snap(n.time), lane, type: "hold", duration: holdLen(n) });
const double = (n) => ({ time: snap(n.time), lane: n.lane, type: "doubleTap" });
const chord = (n, second, withHold) => {
  const note = { time: snap(n.time), lanes: [n.lane, second], type: "chord" };
  if (withHold) note.duration = holdLen(n);
  return note;
};

const isEighthPair = (n, next) =>
  next && !isLong(n) && next.time - n.time < DOUBLE_GAP && (next.pitch === n.pitch || next.lane === n.lane);

// ---- difficulties ----
/** Hard (the old Expert chart, all taps): every melody note on its own (no merged pairs), more chords, and the harmony voices as extra taps. */
function buildHard() {
  const out = melody.map((n, k) => {
    if (isPhraseEnd(n)) return chord(n, harmonyLane(n), true);
    if (isLong(n)) return hold(n);
    return k % EXPERT_CHORD_EVERY === EXPERT_CHORD_EVERY - 1 ? chord(n, harmonyLane(n), false) : tap(n);
  });
  const starts = out.map((n) => n.time);
  const holds = out.filter((n) => n.duration).map((n) => ({ lanes: n.lanes ?? [n.lane], s: n.time, e: n.time + n.duration }));
  const extras = [];
  harmonyTracks.forEach((track, k) => {
    for (const h of track.notes) {
      const time = snap(round3(h.start + lead)), lane = laneFor(h.pitch, harmonyRanges[k]);
      if (starts.some((s) => Math.abs(s - time) < EXPERT_MIN_GAP)) continue;
      if (holds.some((o) => o.lanes.includes(lane) && time > o.s - 0.1 && time < o.e + 0.1)) continue;
      starts.push(time);
      extras.push({ time, lane, type: "tap" });
    }
  });
  // Off-beat taps: where two melody notes are far apart, add a tap halfway between them (alternating lanes).
  let flip = 0;
  melody.forEach((n, i) => {
    const next = melody[i + 1];
    if (!next || isLong(n)) return;
    const gap = next.time - n.time;
    if (gap < EXPERT_SPLIT_GAP) return;
    const time = snap(round3(n.time + gap / 2));
    const lane = Math.max(0, Math.min(3, n.lane + (flip++ % 2 ? 1 : -1) * (n.lane === 0 ? -1 : 1)));
    if (lane === n.lane || lane === next.lane) return;
    if (starts.some((s) => Math.abs(s - time) < EXPERT_MIN_GAP)) return;
    if (holds.some((o) => o.lanes.includes(lane) && time > o.s - 0.1 && time < o.e + 0.1)) return;
    starts.push(time);
    extras.push({ time, lane, type: "tap" });
  });
  return out.concat(extras);
}

function buildNormal() {
  const out = [];
  let pairs = 0;
  for (let i = 0; i < melody.length; i++) {
    const n = melody[i];
    if (!onNormalGrid(n)) continue; // off-beat eighths are dropped (handled below when paired)
    const next = melody[i + 1];
    if (next && !onNormalGrid(next) && isEighthPair(n, next)) {
      if (pairs++ % NORMAL_DOUBLE_EVERY === 0) out.push(double(n)); else out.push(tap(n));
      continue;
    }
    if (isPhraseEnd(n)) {
      // tap chords on phrase endings; the final note is the occasional hold chord
      out.push(n.i === lastIndex ? chord(n, harmonyLane(n), true) : chord(n, harmonyLane(n), false));
    } else if (isLong(n)) out.push(hold(n));
    else out.push(tap(n));
  }
  return thinToTarget(out);
}

/** Normal for dense songs: land near NORMAL_TARGET of the source notes by dropping the weakest plain taps, or by
 *  adding back the strongest skipped notes (at least 0.3 s from every other note, never inside a hold). */
function thinToTarget(notes) {
  if (!NORMAL_TARGET) return notes;
  const target = Math.round(melody.length * NORMAL_TARGET);
  const strength = new Map(melody.map((n) => [n.time, n.vel ?? 0]));
  if (notes.length > target) {
    const weakest = notes.filter((n) => n.type === "tap").sort((a, b) => (strength.get(a.time) ?? 0) - (strength.get(b.time) ?? 0) || a.time - b.time);
    const drop = new Set(weakest.slice(0, notes.length - target));
    return notes.filter((n) => !drop.has(n));
  }
  const out = notes.slice();
  const free = (t) => out.every((n) => Math.abs(n.time - t) >= 0.3 && !(n.duration && t > n.time && t < n.time + n.duration + 0.3));
  const used = new Set(out.map((n) => n.time));
  const spare = melody.filter((n) => !used.has(n.time) && !isLong(n)).sort((a, b) => (b.vel ?? 0) - (a.vel ?? 0) || a.time - b.time);
  for (const n of spare) {
    if (out.length >= target) break;
    if (free(n.time)) out.push(tap(n));
  }
  return out;
}

/** Easy keeps the main beats only: every `stride` beats. Songs with a known bar use the bar; otherwise pick the
 *  stride (1 to 4 beats) that keeps closest to 40% of the notes. */
function easyStride() {
  if (data.easyStride) return data.easyStride;
  if (PHRASE_GRID) return BEATS_PER_BAR;
  let best = { diff: Infinity, stride: BEATS_PER_BAR };
  for (const stride of [1, 2, 3, 4]) {
    const kept = melody.filter((n) => onGrid(n, stride)).length / melody.length;
    if (Math.abs(kept - 0.4) < best.diff) best = { diff: Math.abs(kept - 0.4), stride };
  }
  return best.stride;
}

function buildEasy() {
  const stride = easyStride();
  const mains = melody.filter((n) => onGrid(n, stride));
  const chordAt = new Set(); // a few tap chords
  if (PHRASE_GRID) for (let p = PHRASE; p <= PHRASE * 5; p += PHRASE * 2) chordAt.add(round3(p - BAR)); // two bars before every other phrase ending
  const out = [];
  let prevLane = null;
  mains.forEach((n, k) => {
    // mostly adjacent-lane moves: step at most one lane from the previous note
    let lane = n.lane;
    if (prevLane !== null && Math.abs(lane - prevLane) > 1) lane = prevLane + Math.sign(lane - prevLane);
    const m = { ...n, lane };
    prevLane = lane;
    const chordHere = PHRASE_GRID ? chordAt.has(round3(n.midiStart)) : k % 8 === 5;
    if (isPhraseEnd(n)) out.push(hold(m));
    else if (chordHere) out.push(chord(m, adjacentLane(m), false));
    else out.push(tap(m));
  });
  return out;
}

/** Hard is taps only: holds become taps, chords become one tap per lane, doubleTaps become taps. */
const tapify = (notes) => notes.flatMap((n) => (n.lanes ? n.lanes.map((lane) => ({ time: n.time, lane, type: "tap" })) : [{ time: n.time, lane: n.lane, type: "tap" }]));

/** Hard: fill silent-for-the-player stretches (sustained notes, long gaps) with taps while the music is still sounding. */
const FILL_GAP = 0.8;     // gaps between taps longer than this get filler taps
const FILL_SPACING = 0.5; // aim for about one filler tap per this many seconds
const sounding = (t) => tracks.some((tr) => tr.notes.some((x) => x.start <= t - lead + 0.02 && x.end > t - lead));
function fillGaps(notes) {
  notes.sort((x, y) => x.time - y.time);
  const times = [...new Set(notes.map((x) => x.time))];
  const laneAt = new Map(notes.map((x) => [x.time, x.lane]));
  const extra = [];
  let flip = 0;
  for (let i = 0; i + 1 < times.length; i++) {
    const a = times[i], z = times[i + 1], gap = z - a;
    if (gap <= FILL_GAP) continue;
    const slots = Math.round(gap / FILL_SPACING);
    let prev = laneAt.get(a);
    for (let k = 1; k < slots; k++) {
      const time = snap(round3(a + (gap * k) / slots));
      if (time - a < 0.2 || z - time < 0.2 || !sounding(time)) continue;
      const choices = [0, 1, 2, 3].filter((l) => l !== prev && l !== laneAt.get(z));
      const lane = choices[(flip++ + k) % choices.length];
      extra.push({ time, lane, type: "tap" });
      prev = lane;
    }
  }
  return notes.concat(extra);
}

/** Keep the snapped chart playable: holds release before the next note in their lanes; same-lane collisions are dropped. */
function finalize(notes) {
  if (!MIDI_GRID) return notes;
  notes.sort((a, b) => a.time - b.time);
  const lanesOf = (n) => n.lanes ?? [n.lane];
  const log = [];
  for (const h of notes) {
    if (!h.duration) continue;
    let end = h.time + h.duration;
    for (const o of notes) {
      if (o === h || o.time <= h.time || !lanesOf(o).some((l) => lanesOf(h).includes(l))) continue;
      if (o.time < end + RELEASE_GAP - 1e-6) end = Math.min(end, o.time - RELEASE_GAP);
    }
    if (end < h.time + h.duration - 1e-6) {
      const half = BEAT / 2; // shorten onto the half-beat grid
      const snapped = round3(lead + Math.floor(((end - lead) / BEAT) * 2 + 1e-6) * half);
      const dur = round3(snapped - h.time);
      log.push(`hold at ${h.time} shortened ${h.duration} -> ${dur}`);
      h.duration = dur;
      if (dur < half - 1e-6) log.push(`  WARNING: hold at ${h.time} is now shorter than a half beat`);
    }
  }
  const out = [];
  for (const n of notes) {
    const clash = out.find((o) => lanesOf(o).some((l) => lanesOf(n).includes(l)) && Math.abs(o.time - n.time) < 0.25 + 1e-6 && (o.time === n.time));
    if (clash) { log.push(`dropped ${JSON.stringify(n)} (same time and lane as ${JSON.stringify(clash)})`); continue; }
    out.push(n);
  }
  log.forEach((l) => console.log("    " + l));
  return out;
}

// ---- write ----
const SUBDIVISIONS = { easy: 2, normal: 2, hard: 4 };
const builders = { easy: buildEasy, normal: buildNormal, hard: buildHard };
fs.mkdirSync(path.join(ROOT, "songs/charts"), { recursive: true });
console.log(`${SONG_ID}: ${melody.length} source notes, pitch range ${melodyRange.lo}-${melodyRange.hi}, ${BPM} bpm, ${BEATS_PER_BAR}/4`);
for (const [difficulty, build] of Object.entries(builders)) {
  SUB = SUBDIVISIONS[difficulty];
  const notes = finalize(difficulty === "hard" ? fillGaps(tapify(build())) : build()).sort((a, b) => a.time - b.time);
  const body = notes.map((n) => "    " + JSON.stringify(n)).join(",\n"); // one note per line
  const text = `{\n  "songId": "${SONG_ID}",\n  "difficulty": "${difficulty}",\n  "notes": [\n${body}\n  ]\n}\n`;
  fs.writeFileSync(path.join(ROOT, `songs/charts/${SONG_ID}-${difficulty}.json`), text);
  const counts = {};
  for (const n of notes) {
    const key = n.type === "chord" && n.duration ? "holdChord" : n.type;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log(`  ${difficulty.padEnd(6)} ${String(notes.length).padStart(3)} notes (${Math.round((notes.length / melody.length) * 100)}% of source)`, counts);
}
