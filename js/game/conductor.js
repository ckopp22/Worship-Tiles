// Audio-synced clock. All note placement and judging read songTime(), which comes from the
// AudioContext hardware clock (never frame deltas or Date.now()), so visuals can't drift from the music.
// Suspending the context (pause) freezes this clock automatically.

import { getContext, getMusicGain, unlock, scheduleClick } from "../audio.js";
import { state } from "../state.js";

export const COUNT_IN_BEATS = 3;
/** ?debug=1: metronome click on every beat (audio clock) plus beat lines on screen, to check notes against the beat. */
export const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

let ctx = null;
let source = null;
let songGain = null; // ducks the song when the player stops hitting notes
let audioStart = 0; // context time at which song time 0 (audio start) occurs
let secPerBeat = 1;
let songDuration = 0;

/** Schedule the song to begin after a visual count-in. */
export async function start(buffer, bpm, beatOffset = 0) {
  stop();
  unlock();
  ctx = getContext();
  if (!ctx) throw new Error("Web Audio is not available");
  if (ctx.state !== "running") await ctx.resume();

  secPerBeat = 60 / bpm;
  songDuration = buffer.duration;
  source = ctx.createBufferSource();
  source.buffer = buffer;
  songGain = ctx.createGain();
  songGain.gain.value = 1;
  source.connect(songGain).connect(getMusicGain()); // music gain: slider + Sound toggle control it; the clock keeps running when muted
  audioStart = ctx.currentTime + COUNT_IN_BEATS * secPerBeat;
  source.start(audioStart);
  if (DEBUG) { // beat n is at song time beatOffset + n * secPerBeat; clicks run on the same audio clock as the song
    for (let n = -COUNT_IN_BEATS; beatOffset + n * secPerBeat < songDuration; n++) scheduleClick(audioStart + beatOffset + n * secPerBeat);
  }
}

const QUIET = 0.12;

/** Last note was hit: full volume (and it stays there through gaps in the notes). */
export function boost() { fadeTo(1, 0.04); }

/** Last note was missed: fade the song down until the next hit. */
export function duck() { fadeTo(QUIET, 0.25); }

function fadeTo(level, tc) {
  if (!songGain || !ctx) return;
  const t = ctx.currentTime, g = songGain.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(level, t, tc);
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
  if (songGain) { songGain.disconnect(); songGain = null; }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}
