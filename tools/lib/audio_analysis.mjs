// Audio analysis for charting songs that have no MIDI: decode with macOS afconvert, find note onsets
// (spectral flux), estimate a pitch contour per onset, and estimate tempo / beat grid.
// Pure Node, no dependencies (decoding needs macOS `afconvert`).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SR = 22050;

/** Decode any audio file to mono Float32 samples at 22.05 kHz (via afconvert). */
export function decode(file) {
  const tmp = path.join(os.tmpdir(), `wt-${process.pid}-${Math.random().toString(36).slice(2)}.wav`);
  const r = spawnSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${SR}`, "-c", "1", file, tmp]);
  if (r.status !== 0) throw new Error(`afconvert failed for ${file}: ${r.stderr}`);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  let pos = 12;
  while (pos < buf.length - 8) { // find the "data" chunk
    const id = buf.toString("latin1", pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    if (id === "data") {
      const n = Math.floor(Math.min(size, buf.length - pos - 8) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(pos + 8 + i * 2) / 32768;
      return out;
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error("No data chunk in decoded wav");
}

// ---------- FFT ----------
const fftCache = new Map();
function fftPlan(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2), rev = new Uint32Array(n);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const plan = { cos, sin, rev };
  fftCache.set(n, plan);
  return plan;
}
/** In-place FFT of (re, im). */
function fft(re, im) {
  const n = re.length, { cos, sin, rev } = fftPlan(n);
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step], s = sin[k * step], a = start + k, b = a + half;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}
const hann = (n) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

/** Magnitude spectrum (n/2 bins) of x[start .. start+n). */
function magnitude(x, start, n, win, re, im) {
  for (let i = 0; i < n; i++) { const v = x[start + i]; re[i] = (v === undefined ? 0 : v) * win[i]; im[i] = 0; }
  fft(re, im);
  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

// ---------- onsets ----------
const N = 1024, HOP = 128;
const MAX_BIN = Math.floor((4000 * N) / SR);

/** Onset strength per frame (log-spectral flux with a small max filter against vibrato). */
export function onsetEnvelope(x) {
  const win = hann(N), re = new Float32Array(N), im = new Float32Array(N);
  const frames = Math.max(0, Math.floor((x.length - N) / HOP));
  const env = new Float32Array(frames);
  let prev = null;
  for (let k = 0; k < frames; k++) {
    const m = magnitude(x, k * HOP, N, win, re, im);
    const cur = new Float32Array(MAX_BIN);
    for (let b = 0; b < MAX_BIN; b++) cur[b] = Math.log1p(m[b] * 30);
    if (prev) {
      let flux = 0;
      for (let b = 1; b < MAX_BIN - 1; b++) {
        const ref = Math.max(prev[b - 1], prev[b], prev[b + 1]);
        const d = cur[b] - ref;
        if (d > 0) flux += d;
      }
      env[k] = flux;
    }
    prev = cur;
  }
  return env;
}

const frameTime = (k) => (k * HOP + N / 2) / SR;

/** Pick onset peaks from the envelope. Returns [{time, strength, frame}] (time uncorrected). */
export function pickOnsets(env, { minGap = 0.14, sensitivity = 1.0 } = {}) {
  const win = Math.round(0.5 / (HOP / SR)); // +-0.5 s local statistics
  const peakR = Math.round(0.05 / (HOP / SR));
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.9)] * 0.25;
  const out = [];
  for (let k = peakR; k < env.length - peakR; k++) {
    let isMax = true;
    for (let j = k - peakR; j <= k + peakR; j++) if (env[j] > env[k]) { isMax = false; break; }
    if (!isMax || env[k] < floor) continue;
    let sum = 0, sq = 0, n = 0;
    for (let j = Math.max(0, k - win); j < Math.min(env.length, k + win); j++) { sum += env[j]; sq += env[j] * env[j]; n++; }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    if (env[k] < mean + 0.9 * sensitivity * sd) continue;
    const t = frameTime(k);
    if (out.length && t - out[out.length - 1].time < minGap) {
      if (env[k] > out[out.length - 1].strength) out[out.length - 1] = { time: t, strength: env[k], frame: k };
      continue;
    }
    out.push({ time: t, strength: env[k], frame: k });
  }
  return out;
}

// ---------- pitch contour ----------
const PN = 4096;
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);

/**
 * Estimate a pitch (MIDI number) for the note starting at time t.
 * mode "top": highest strongly-supported pitch (the top voice, usually the tune in a hymn setting)
 * mode "loud": the pitch with the strongest harmonic support.
 */
export function pitchAt(x, t, mode = "top") {
  const start = Math.round(t * SR) + Math.round(0.02 * SR);
  const win = hann(PN), re = new Float32Array(PN), im = new Float32Array(PN);
  const m = magnitude(x, start, PN, win, re, im);
  const binHz = SR / PN;
  const at = (f) => { const b = f / binHz, i = Math.floor(b), fr = b - i; return i + 1 < m.length ? m[i] * (1 - fr) + m[i + 1] * fr : 0; };
  const cands = [];
  for (let midi = 48; midi <= 84; midi++) {
    const f0 = midiToHz(midi);
    // peak must actually be there (allow +-half a semitone)
    const own = Math.max(at(f0 * 0.985), at(f0), at(f0 * 1.015));
    let s = own;
    for (let h = 2; h <= 4; h++) s += Math.max(at(f0 * h * 0.99), at(f0 * h), at(f0 * h * 1.01)) / h;
    cands.push({ midi, own, s });
  }
  const maxS = Math.max(...cands.map((c) => c.s)) || 1;
  const strong = cands.filter((c, i) => c.s >= 0.45 * maxS && c.s >= (cands[i - 1]?.s ?? 0) && c.s >= (cands[i + 1]?.s ?? 0));
  if (!strong.length) return 60;
  if (mode === "loud") return strong.reduce((a, b) => (b.s > a.s ? b : a)).midi;
  // top voice: highest local peak that is not just an upper harmonic of a lower strong pitch
  const sorted = strong.slice().sort((a, b) => b.midi - a.midi);
  for (const c of sorted) {
    const harmonicOfLower = strong.some((l) => l.midi < c.midi && [12, 19, 24].includes(c.midi - l.midi) && l.s > c.s * 1.2);
    if (!harmonicOfLower) return c.midi;
  }
  return sorted[0].midi;
}

// ---------- tempo & beat grid ----------
/** Estimate BPM, the time of a downbeat, and beats per bar (3 or 4) from onsets. */
export function estimateGrid(onsets, duration) {
  const step = 0.01; // 10 ms onset signal
  const len = Math.ceil(duration / step);
  const sig = new Float32Array(len);
  for (const o of onsets) { const i = Math.round(o.time / step); if (i < len) sig[i] += o.strength; }
  const smooth = new Float32Array(len);
  for (let i = 0; i < len; i++) for (let j = -2; j <= 2; j++) if (sig[i + j]) smooth[i] += sig[i + j] * (1 - Math.abs(j) / 3);

  // tempo: comb score over a BPM grid, weighted toward hymn tempos
  let best = { score: -1, bpm: 80 };
  for (let bpm = 50; bpm <= 140; bpm += 0.5) {
    const beat = 60 / bpm;
    let top = 0;
    for (let phase = 0; phase < beat; phase += step * 2) {
      let s = 0, cnt = 0;
      for (let t = phase; t < duration; t += beat) { const i = Math.round(t / step); s += smooth[i] || 0; cnt++; }
      top = Math.max(top, s / cnt);
    }
    const prior = Math.exp(-Math.pow(Math.log2(bpm / 84), 2) / (2 * 0.45 * 0.45));
    const score = top * prior;
    if (score > best.score) best = { score, bpm };
  }
  const bpm = best.bpm, beat = 60 / bpm;

  // phase of the beat grid
  let phaseBest = { s: -1, phase: 0 };
  for (let phase = 0; phase < beat; phase += step) {
    let s = 0;
    for (let t = phase; t < duration; t += beat) s += smooth[Math.round(t / step)] || 0;
    if (s > phaseBest.s) phaseBest = { s, phase };
  }

  // bar length: accent contrast for 3 vs 4 beats per bar, and which beat is the downbeat
  const beatCount = Math.floor((duration - phaseBest.phase) / beat);
  const beatStrength = Array.from({ length: beatCount }, (_, j) => {
    const t = phaseBest.phase + j * beat; let s = 0;
    for (let d = -2; d <= 2; d++) s += smooth[Math.round(t / step) + d] || 0;
    return s;
  });
  let bar = { contrast: -1, k: 4, offset: 0 };
  for (const k of [4, 3]) {
    const sums = new Array(k).fill(0), counts = new Array(k).fill(0);
    beatStrength.forEach((s, j) => { sums[j % k] += s; counts[j % k]++; });
    const avg = sums.map((s, i) => s / (counts[i] || 1)), mean = avg.reduce((a, b) => a + b, 0) / k;
    const top = Math.max(...avg), contrast = top / (mean || 1) - (k === 3 ? 0 : 0.02);
    if (contrast > bar.contrast) bar = { contrast, k, offset: avg.indexOf(top) };
  }
  return { bpm: Math.round(bpm * 10) / 10, beatsPerBar: bar.k, gridOrigin: phaseBest.phase + bar.offset * beat };
}
