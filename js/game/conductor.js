// Audio-synced clock. All note placement and judging read songTime(), which comes from the
// AudioContext hardware clock (never frame deltas or Date.now()), so visuals can't drift from the music.
// Suspending the context (pause) freezes this clock automatically.

import { getContext, getMusicGain, unlock } from "../audio.js";
import { state } from "../state.js";

export const COUNT_IN_BEATS = 3;

let ctx = null;
let source = null;
let audioStart = 0; // context time at which song time 0 (audio start) occurs
let secPerBeat = 1;
let songDuration = 0;

/** Schedule the song to begin after a visual count-in. */
export async function start(buffer, bpm) {
  stop();
  unlock();
  ctx = getContext();
  if (!ctx) throw new Error("Web Audio is not available");
  if (ctx.state !== "running") await ctx.resume();

  secPerBeat = 60 / bpm;
  songDuration = buffer.duration;
  source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(getMusicGain()); // music gain: slider + Sound toggle control it; the clock keeps running when muted
  audioStart = ctx.currentTime + COUNT_IN_BEATS * secPerBeat;
  source.start(audioStart);
}

/**
 * Current song time in seconds: negative during the count-in, 0 at the audio start.
 * A positive latencyOffsetMs means audio is heard late, so notes are shifted later to match.
 */
export function songTime() {
  if (!ctx) return -COUNT_IN_BEATS * secPerBeat;
  return ctx.currentTime - audioStart - state.settings.latencyOffsetMs / 1000;
}

export const duration = () => songDuration;
export const beatLength = () => secPerBeat;

/** During the count-in: 3, 2, 1. Otherwise 0. */
export function countInNumber(t) {
  return t < 0 ? Math.ceil(-t / secPerBeat - 1e-6) : 0;
}

export async function pause() {
  if (ctx && ctx.state === "running") await ctx.suspend();
}

export async function resume() {
  if (ctx && ctx.state === "suspended") await ctx.resume();
}

export function stop() {
  if (source) {
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    source = null;
  }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}
