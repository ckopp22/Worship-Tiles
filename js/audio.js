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
