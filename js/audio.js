// Web Audio foundation: AudioContext (unlocked on first tap) and the gain graph.
//   songs + menu music -> musicGain --\
//   SFX / jingles      -> sfxGain   ---+-> master (Sound toggle: 0 or 1) -> speakers
// Music and SFX levels come from the Settings sliders; SFX_BASE keeps hit sounds under the hymn.

import { state, subscribe } from "./state.js";

const SFX_BASE = 0.6;

let ctx = null;
let master = null, musicGain = null, sfxGain = null;

function applyGains() {
  if (!master) return;
  const t = ctx.currentTime;
  // short ramps avoid clicks when toggling or dragging a slider
  master.gain.setTargetAtTime(state.settings.soundEnabled ? 1 : 0, t, 0.015);
  musicGain.gain.setTargetAtTime(state.settings.musicVolume, t, 0.02);
  sfxGain.gain.setTargetAtTime(state.settings.sfxVolume * SFX_BASE, t, 0.02);
}

/** Create/resume the AudioContext. Must be called from a user gesture (iOS). */
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
    applyGains();
    // iOS: playing a silent buffer inside the gesture fully unlocks output
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    if (menuMusicWanted) startMenuMusic();
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
export const getMasterGain = () => master; // the Sound toggle node (exposed for tests)
/** Songs (and menu music) connect here so the Music slider and Sound toggle control them. */
export const getMusicGain = () => musicGain;

subscribe(applyGains);

// ---- Menu music: loops the file named by "menuMusic" in songs/songs.json (e.g. "songs/audio/menu.mp3").
// If that key is empty or missing, nothing is requested and nothing plays (no 404s in the console). ----
let menuMusicWanted = false;
let menuBuffer = null;     // decoded loop
let menuMissing = false;   // file not found: never ask again
let menuSource = null;
let menuLoading = false;
let menuUrlPromise = null;

const getMenuUrl = () => (menuUrlPromise ??= fetch("songs/songs.json")
  .then((res) => (res.ok ? res.json() : {}))
  .then((json) => json.menuMusic || null)
  .catch(() => null));

export async function startMenuMusic() {
  menuMusicWanted = true;
  if (!ctx || menuSource || menuMissing || menuLoading) return;
  try {
    if (!menuBuffer) {
      menuLoading = true;
      const url = await getMenuUrl();
      if (!url) { menuMissing = true; return; }
      const res = await fetch(url);
      if (!res.ok) { menuMissing = true; return; }
      menuBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
    }
  } catch {
    menuMissing = true;
    return;
  } finally {
    menuLoading = false;
  }
  if (!menuMusicWanted || menuSource) return; // stopped while loading
  menuSource = ctx.createBufferSource();
  menuSource.buffer = menuBuffer;
  menuSource.loop = true;
  menuSource.connect(musicGain);
  menuSource.start();
}

export function stopMenuMusic() {
  menuMusicWanted = false;
  if (!menuSource) return;
  try { menuSource.stop(); } catch { /* already stopped */ }
  menuSource.disconnect();
  menuSource = null;
}

export const isMenuMusicPlaying = () => menuSource !== null;

// ---- Sound effects (oscillators, routed through the SFX gain) ----
function blip(type, hz, endHz, dur, peak, when = 0) {
  if (!ctx || ctx.state !== "running") return;
  const t = Math.max(ctx.currentTime, when);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  if (endHz !== hz) osc.frequency.exponentialRampToValueAtTime(endHz, t + dur);
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(sfxGain);
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

/** Metronome click at a precise context time (timing test). */
export function scheduleClick(when) {
  blip("square", 1000, 1000, 0.04, 0.18, when);
}

/** Short uplifting jingle for the Results screen: a rising C major arpeggio ending on a held chord. */
export function playJingle() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => blip("sine", hz, hz, 0.45, 0.14, t + i * 0.13));
  [523.25, 659.25, 783.99, 1046.5].forEach((hz) => blip("triangle", hz, hz, 1.0, 0.07, t + 0.52));
}
