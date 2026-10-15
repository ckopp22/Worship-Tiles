// Web Audio foundation: AudioContext (unlocked on first tap), master gain tied to the sound toggle.

import { state, subscribe } from "./state.js";

let ctx = null;
let master = null;

function applySound() {
  if (!master) return;
  // short ramp avoids clicks when toggling
  master.gain.setTargetAtTime(state.settings.soundEnabled ? 1 : 0, ctx.currentTime, 0.015);
}

/** Create/resume the AudioContext. Must be called from a user gesture (iOS). */
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applySound();
    // iOS: playing a silent buffer inside the gesture fully unlocks output
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

/** Call once at boot: unlock audio on the first user gesture, then stop listening. */
export function installUnlockOnFirstTap() {
  const events = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
  const handler = () => {
    unlock();
    if (ctx && ctx.state === "running") events.forEach((e) => document.removeEventListener(e, handler, true));
  };
  events.forEach((e) => document.addEventListener(e, handler, true));
}

export const getContext = () => ctx;
/** Route all sound (music, SFX, song audio) through this node so the toggle mutes everything. */
export const getMasterGain = () => master;

subscribe(applySound);

// Menu music hook: no audio files yet. Later, load a buffer and loop it through the master gain.
export function startMenuMusic() {}
export function stopMenuMusic() {}

// ---- Sound effects (oscillators, routed through the master gain so the toggle mutes them) ----
function blip(type, hz, endHz, dur, peak) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  if (endHz !== hz) osc.frequency.exponentialRampToValueAtTime(endHz, t + dur);
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const CHIME_HZ = { perfect: 1568, great: 1319, good: 1047 }; // G6 / E6 / C6, in key with the test track

/** Soft chime on a hit. */
export function playHit(grade) {
  blip("sine", CHIME_HZ[grade] ?? 1047, CHIME_HZ[grade] ?? 1047, 0.3, 0.1);
}

/** Subtle low tone on a miss. */
export function playMiss() {
  blip("triangle", 190, 140, 0.14, 0.06);
}
