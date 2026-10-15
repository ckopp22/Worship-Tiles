// Builds tools/data/<id>.notes.json from a song's audio when no MIDI is available.
//   node tools/analyze_song.mjs <id>       (audio: songs/audio/<id>.mp3 or .m4a)
// Finds note onsets, estimates a pitch contour (the top voice) and the tempo / beat grid. The output has
// the same shape as the hand-supplied amazing-grace.notes.json, so tools/make_charts.mjs can use it.
// It is an approximation: rhythm is accurate, pitch (lane) is an estimate. A real MIDI-derived notes.json
// always gives better charts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SR, decode, onsetEnvelope, pickOnsets, pitchAt, estimateGrid } from "./lib/audio_analysis.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) { console.error("usage: node tools/analyze_song.mjs <song-id>"); process.exit(1); }
const file = ["mp3", "m4a"].map((e) => path.join(ROOT, `songs/audio/${id}.${e}`)).find((f) => fs.existsSync(f));
if (!file) { console.error(`No audio found for ${id}`); process.exit(1); }

const MAX_NOTE = 3.0;   // longest note length we report (seconds)
const START_SKIP = 0.3; // ignore onsets right at the start (decoder noise)
const END_SKIP = 0.8;   // and in the final fade-out

const x = decode(file);
const duration = x.length / SR;
const onsets = pickOnsets(onsetEnvelope(x), { sensitivity: 1.0 }).filter((o) => o.time > START_SKIP && o.time < duration - END_SKIP);
const grid = estimateGrid(onsets, duration);

// pitch per onset, median-smoothed over three neighbours to ignore single-onset octave slips
const raw = onsets.map((o) => pitchAt(x, o.time - 0.011, "top"));
const pitches = raw.map((p, i) => [raw[i - 1] ?? p, p, raw[i + 1] ?? p].sort((a, b) => a - b)[1]);

// A held melody note is re-struck by the accompaniment, so several onsets in a row with the same pitch
// (within a semitone) are merged into one sustained note when together they last long enough.
const MERGE_MIN_ONSETS = 3, MERGE_MIN_SPAN = 1.3, MERGE_MAX_GAP = 0.8;
const notes = [];
for (let i = 0; i < onsets.length; ) {
  let j = i;
  while (j + 1 < onsets.length && Math.abs(pitches[j + 1] - pitches[i]) <= 1 && onsets[j + 1].time - onsets[j].time <= MERGE_MAX_GAP) j++;
  const nextStart = onsets[j + 1]?.time ?? duration;
  const span = nextStart - onsets[i].time;
  const merge = j - i + 1 >= MERGE_MIN_ONSETS && span >= MERGE_MIN_SPAN;
  const last = merge ? j : i; // not merged: just this onset; the loop continues with the next one
  const end = Math.min(onsets[i].time + MAX_NOTE, merge ? nextStart : (onsets[i + 1]?.time ?? duration));
  notes.push({
    start: Math.round(onsets[i].time * 1000) / 1000,
    end: Math.round(Math.max(onsets[i].time + 0.12, end) * 1000) / 1000,
    pitch: pitches[i],
    vel: Math.round(onsets[i].strength * 100) / 100,
  });
  i = last + 1;
}

const out = {
  songId: id,
  source: "audio-onsets",
  note: "Estimated from the audio by tools/analyze_song.mjs (no MIDI). start/end are seconds in the shipped audio file.",
  leadInSeconds: 0,
  // The browser trims MP3 decoder delay a little differently from afconvert (measured: Chrome starts MP3 audio
  // about 12 ms later); AAC/m4a decodes identically in both.
  audioOffsetSeconds: file.endsWith(".mp3") ? 0.012 : 0,
  bpm: grid.bpm,
  beatsPerBar: grid.beatsPerBar,
  gridOrigin: Math.round(grid.gridOrigin * 1000) / 1000,
  beatTolerance: 0.2,
  phraseGrid: false,
  rangePercentile: true,
  laneBands: "quantile",
  doubleSpacing: 4,
  normalSubdivision: 2,
  normalTarget: 0.7,
  tracks: [{ index: 1, name: "Melody", notes }],
};
fs.mkdirSync(path.join(ROOT, "tools/data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, `tools/data/${id}.notes.json`), JSON.stringify(out, null, 1) + "\n");
const gaps = notes.slice(1).map((n, i) => n.start - notes[i].start);
console.log(`${id}: ${duration.toFixed(1)} s, ${notes.length} onsets (${(notes.length / duration).toFixed(2)}/s), ${grid.bpm} bpm, ${grid.beatsPerBar}/4, long notes >=1.3s: ${notes.filter((n) => n.end - n.start >= 1.3).length}, >=2s: ${notes.filter((n) => n.end - n.start >= 2).length}`);
