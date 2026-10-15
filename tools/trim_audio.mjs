// Trim a long song to about a minute with a clean ending: pick a quiet moment between MIN and MAX
// seconds, fade out over the last FADE seconds, and encode to AAC (.m4a, plays on iPhone and Android).
//   node tools/trim_audio.mjs <input.mp3> <output.m4a>
// Needs macOS afconvert. The input file is never modified.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MIN = 60, MAX = 80, TARGET = 68; // allowed cut window and the preferred spot, in seconds
const FADE = 1.6;                      // fade-out length in seconds
const BITRATE = 96000;

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node tools/trim_audio.mjs <input> <output.m4a>"); process.exit(1); }

const tmp = (ext) => path.join(os.tmpdir(), `wt-trim-${process.pid}-${Math.random().toString(36).slice(2)}.${ext}`);
const run = (args) => { const r = spawnSync("afconvert", args); if (r.status !== 0) throw new Error(`afconvert ${args.join(" ")}: ${r.stderr}`); };

// decode to 16-bit PCM wav at the file's own sample rate / channel count
const wav = tmp("wav");
run(["-f", "WAVE", "-d", "LEI16", input, wav]);
const buf = fs.readFileSync(wav);
fs.unlinkSync(wav);
const channels = buf.readUInt16LE(22), rate = buf.readUInt32LE(24);
let pos = 12, dataStart = 0, dataSize = 0;
while (pos < buf.length - 8) {
  const id = buf.toString("latin1", pos, pos + 4), size = buf.readUInt32LE(pos + 4);
  if (id === "data") { dataStart = pos + 8; dataSize = Math.min(size, buf.length - dataStart); break; }
  pos += 8 + size + (size & 1);
}
const frames = Math.floor(dataSize / (2 * channels));
const duration = frames / rate;
if (duration <= MAX + 5) { console.log(`${path.basename(input)}: ${duration.toFixed(1)} s is short enough, not trimming`); process.exit(2); }

const sample = (f, c) => buf.readInt16LE(dataStart + (f * channels + c) * 2) / 32768;

// short-term energy per 50 ms
const hop = Math.round(rate * 0.05), blocks = Math.floor(frames / hop);
const energy = new Float64Array(blocks);
for (let b = 0; b < blocks; b++) {
  let e = 0;
  for (let i = 0; i < hop; i += 4) for (let c = 0; c < channels; c++) e += sample(b * hop + i, c) ** 2;
  energy[b] = e / (hop / 4 * channels);
}
const smooth = (b) => { let s = 0, n = 0; for (let j = -3; j <= 3; j++) if (energy[b + j] !== undefined) { s += energy[b + j]; n++; } return s / n; };
const sorted = Array.from(energy).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];

// quietest moment in the window, with a mild pull toward TARGET
let best = { cost: Infinity, b: 0 };
for (let b = Math.round(MIN / 0.05); b <= Math.round(MAX / 0.05); b++) {
  const cost = smooth(b) / median + 0.004 * Math.abs(b * 0.05 - TARGET);
  if (cost < best.cost) best = { cost, b };
}
const cutFrames = Math.min(frames, (best.b + 2) * hop); // end just after the valley
const fadeFrames = Math.round(FADE * rate);
const cutSeconds = cutFrames / rate;

// write the faded, trimmed wav
const out = Buffer.alloc(44 + cutFrames * channels * 2);
out.write("RIFF", 0, "latin1"); out.writeUInt32LE(36 + cutFrames * channels * 2, 4); out.write("WAVEfmt ", 8, "latin1");
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22); out.writeUInt32LE(rate, 24);
out.writeUInt32LE(rate * channels * 2, 28); out.writeUInt16LE(channels * 2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36, "latin1"); out.writeUInt32LE(cutFrames * channels * 2, 40);
for (let f = 0; f < cutFrames; f++) {
  const left = cutFrames - f;
  const gain = left >= fadeFrames ? 1 : Math.pow(Math.sin((left / fadeFrames) * Math.PI / 2), 2); // smooth fade to silence
  for (let c = 0; c < channels; c++) {
    out.writeInt16LE(Math.round(buf.readInt16LE(dataStart + (f * channels + c) * 2) * gain), 44 + (f * channels + c) * 2);
  }
}
const trimmed = tmp("wav");
fs.writeFileSync(trimmed, out);
fs.mkdirSync(path.dirname(output), { recursive: true });
run(["-f", "m4af", "-d", "aac", "-b", String(BITRATE), trimmed, output]);
fs.unlinkSync(trimmed);
console.log(`${path.basename(input)}: ${duration.toFixed(1)} s -> ${cutSeconds.toFixed(1)} s (energy at cut ${(smooth(best.b) / median).toFixed(2)}x median), ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
