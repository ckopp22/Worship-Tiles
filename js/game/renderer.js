// Canvas rendering for the gameplay screen: layout, back-to-back tiles (tap / hold), floating labels and the HUD.
// Pools are preallocated so frames create no objects.

import { state } from "../state.js";
import { LANE_COUNT, Kind, NoteState } from "./notes.js";

const HIT_LINE_FROM_BOTTOM = 0.25; // fraction of screen height, measured above the bottom safe area
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TEXT_LIFE = 0.7, FLASH_LIFE = 0.25;
const MAX_TEXTS = 10, BANNER_LIFE = 1.2, MOTE_COUNT = 26;
const TAPPED_ALPHA = 0.22; // a tapped tile stays on its way down, faded

let canvas, g, probe;
let W = 0, H = 0, dpr = 1, safeTop = 0, safeBottom = 0;
let laneW = 0, hitY = 0, speed = 0;
let beatFraction = 0.25, beatSeconds = 0.6; // screen heights and seconds per beat
let bgCanvas = null, flashCanvas = null, flashH = 0;
let tapFill = null, holdFill = null; // unit-height gradients, scaled to each tile

let field = null, judge = null, firstVisible = 0;
let scoreStr = "0", scoreVal = 0, comboStr = "", comboVal = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const laneFlash = new Array(LANE_COUNT).fill(-10);
const texts = Array.from({ length: MAX_TEXTS }, () => ({ on: false, text: "", x: 0, t0: 0 }));
let textNext = 0;
const banner = { on: false, text: "", t0: 0 };

// drifting sparkles: fixed fractions (no randomness), positions computed from song time each frame
const motes = Array.from({ length: MOTE_COUNT }, (_, i) => ({
  fx: (i * 0.618034) % 1, fy: (i * 0.381966 + 0.13) % 1, speed: 6 + (i % 5) * 3, r: 1 + (i % 3) * 0.9, phase: i,
}));

// ======================= setup =======================

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  g = canvas.getContext("2d");
  probe = document.createElement("div"); // reads safe-area insets as pixels
  probe.style.cssText = "position:absolute;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
  canvas.parentElement.appendChild(probe);
}

/** Recompute layout and sprites. Returns false while the canvas is hidden. */
export function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  dpr = window.devicePixelRatio || 1;
  W = w; H = h;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const cs = getComputedStyle(probe);
  safeTop = parseFloat(cs.paddingTop) || 0;
  safeBottom = parseFloat(cs.paddingBottom) || 0;
  laneW = W / LANE_COUNT;
  hitY = H - safeBottom - H * HIT_LINE_FROM_BOTTOM;
  applySpeed();
  buildBackground();
  return true;
}

/** `fraction` screen heights scroll past per beat of `seconds`. */
export function setTempo(fraction, seconds) {
  beatFraction = fraction;
  beatSeconds = seconds;
  if (H) applySpeed();
}

function applySpeed() {
  speed = (H * beatFraction) / beatSeconds;
}

/** Attach the current run's notes and judge; clears all effects. */
export function bindRun(fieldRef, judgeRef) {
  field = fieldRef;
  judge = judgeRef;
  firstVisible = 0;
  const notes = field.notes; // sorted by time: each tile reaches up to where the next row starts
  for (let i = notes.length - 1, next = null; i >= 0; i--) {
    const n = notes[i], after = notes[i + 1];
    if (after && after.time - n.time > 0.001) next = after.time;
    n.span = next === null ? Math.max(n.duration, beatSeconds) : next - n.time;
  }
  scoreStr = "0"; scoreVal = 0; comboStr = ""; comboVal = 0;
  laneFlash.fill(-10);
  texts.forEach((x) => (x.on = false));
  banner.on = false;
  redFlashT = -10;
}

function makeLayer(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const x = c.getContext("2d");
  x.scale(dpr, dpr);
  return [c, x];
}

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/** Static layer: bright gradient, diagonal stripes, hit line and lane dividers; plus the lane flash sprite and tile gradients. */
function buildBackground() {
  let x;
  [bgCanvas, x] = makeLayer(W, H);
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#b484c4");
  grad.addColorStop(0.4, "#f27fdc");
  grad.addColorStop(0.75, "#e6a8f2");
  grad.addColorStop(1, "#a98ad0");
  x.fillStyle = grad;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,.07)";
  x.lineWidth = laneW * 0.22;
  for (let i = -H; i < W + H; i += laneW * 0.7) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H * 0.7, H); x.stroke();
  }
  x.fillStyle = "rgba(90,40,150,.14)";
  x.fillRect(0, hitY, W, H - hitY);
  x.shadowColor = "#fff";
  x.shadowBlur = 14;
  x.fillStyle = "rgba(255,255,255,.75)";
  x.fillRect(0, hitY - 1, W, 2);
  x.shadowBlur = 0;
  x.strokeStyle = "rgba(255,255,255,.45)";
  x.lineWidth = 1;
  for (let i = 1; i < LANE_COUNT; i++) {
    x.beginPath(); x.moveTo(i * laneW, 0); x.lineTo(i * laneW, H); x.stroke();
  }

  flashH = H * 0.35;
  let fx;
  [flashCanvas, fx] = makeLayer(laneW, flashH);
  const fg = fx.createLinearGradient(0, 0, 0, flashH);
  fg.addColorStop(0, "rgba(255,255,255,0)");
  fg.addColorStop(1, "rgba(255,255,255,.45)");
  fx.fillStyle = fg;
  fx.fillRect(0, 0, laneW, flashH);

  tapFill = "#000";
  holdFill = g.createLinearGradient(0, 0, 0, 1);
  holdFill.addColorStop(0, "#4aa8f5");
  holdFill.addColorStop(1, "#02060c");
}

export function flashLane(lane, t) { laneFlash[lane] = t; }

let redFlashT = -10;
/** A miss or wrong tap on Hard: the whole screen flashes red. */
export function flashRed(t) { redFlashT = t; }

function drawDanger(t) {
  if (!judge.penalty) return;
  const flash = 1 - (t - redFlashT) / 0.4;
  const low = judge.health < 35 ? (1 - judge.health / 35) * (0.12 + 0.08 * Math.sin(t * 6)) : 0; // steady red glow when nearly failing
  const a = Math.max(flash > 0 && flash <= 1 ? flash * 0.4 : 0, low);
  if (a > 0) { g.globalAlpha = a; g.fillStyle = "#e03030"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}

/** Floating label centered on `x` (px), rising from the hit line. */
export function spawnLabel(text, x, t) {
  const slot = texts[textNext++ % MAX_TEXTS];
  slot.on = true; slot.text = text; slot.x = x; slot.t0 = t;
}

/** Brief banner such as "10 combo!". */
export function showBanner(text, t) {
  banner.on = true; banner.text = text; banner.t0 = t;
}

/** Seconds before and after its note time that a tile may be tapped: from entering the top until half a beat past the bottom. */
export const visibleWindow = () => ({ early: hitY / speed, late: (H - hitY) / speed + beatSeconds / 2 });

export const laneX = (lane) => (lane + 0.5) * laneW;

// ======================= drawing =======================

export function draw(t, bigNumber, bigFrac) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(bgCanvas, 0, 0, W, H);
  if (!reduceMotion.matches) drawMotes(t);
  drawFlashes(t);
  if (beatLen) drawBeatLines(t);
  drawNotes(t);
  drawEffects(t);
  drawDanger(t);
  drawHud(t);
  if (bigNumber) drawBigNumber(bigNumber, bigFrac);
}

let beatLen = 0, beatOrigin = 0;
/** Debug (?debug=1): draw a thin line at every beat, scrolling with the notes. */
export function setBeatGrid(secondsPerBeat, offset) { beatLen = secondsPerBeat; beatOrigin = offset; }

function drawBeatLines(t) {
  const first = Math.ceil((t - (H - hitY) / speed - beatOrigin) / beatLen), last = Math.floor((t + hitY / speed - beatOrigin) / beatLen);
  g.strokeStyle = "#7fe3ff"; g.lineWidth = 1; g.globalAlpha = 0.6;
  g.beginPath();
  for (let n = first; n <= last; n++) {
    const y = hitY - (beatOrigin + n * beatLen - t) * speed;
    g.moveTo(0, y); g.lineTo(W, y);
  }
  g.stroke();
  g.globalAlpha = 1;
}

function drawMotes(t) {
  g.fillStyle = "#fff";
  for (let i = 0; i < MOTE_COUNT; i++) {
    const m = motes[i];
    const y = (((m.fy * H - t * m.speed) % H) + H) % H;
    g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 0.8 + m.phase);
    g.beginPath();
    g.arc(m.fx * W + Math.sin(t * 0.3 + m.phase) * 10, y, m.r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawFlashes(t) {
  for (let i = 0; i < LANE_COUNT; i++) {
    const age = t - laneFlash[i];
    if (age < 0 || age > FLASH_LIFE) continue;
    g.globalAlpha = 1 - age / FLASH_LIFE;
    g.drawImage(flashCanvas, i * laneW, H - flashH, laneW, flashH);
  }
  g.globalAlpha = 1;
}

/** Tiles sit back to back: the bottom edge is the note time, the top edge is the next row. */
function drawNotes(t) {
  const notes = field.notes;
  // skip tiles that have fully scrolled off the bottom
  while (firstVisible < notes.length && notes[firstVisible].time + notes[firstVisible].span < t - (H - hitY) / speed) firstVisible++;
  for (let i = firstVisible; i < notes.length; i++) {
    const n = notes[i];
    const bottom = hitY - (n.time - t) * speed;
    if (bottom < 0) break; // not on screen yet (sorted by time)
    drawTile(n, n.lane * laneW, bottom - n.span * speed, n.span * speed);
  }
  g.globalAlpha = 1;
}

function drawTile(n, x, top, h) {
  const hold = n.kind === Kind.HOLD;
  const done = n.state === NoteState.HIT || n.state === NoteState.BROKEN;
  g.globalAlpha = done ? TAPPED_ALPHA : 1;
  g.save();
  g.translate(x, top);
  if (n.state === NoteState.MISSED) {
    g.fillStyle = "rgba(230,50,70,.8)";
    g.fillRect(0, 0, laneW, h);
  } else {
    g.scale(1, h);
    g.fillStyle = hold ? holdFill : tapFill;
    g.fillRect(0, 0, laneW, 1);
  }
  g.restore();
  if (!hold || done || n.state === NoteState.MISSED) return;

  const cx = x + laneW / 2, bottom = top + h;
  if (n.state === NoteState.HELD) { // cyan fill rises from the bottom of the tile to the hit line
    const fillTop = Math.max(top, Math.min(bottom - laneW, hitY - laneW / 2));
    const r = Math.min(laneW / 2, (bottom - fillTop) / 2);
    g.fillStyle = "#6ae6fb";
    g.beginPath();
    g.moveTo(x, bottom);
    g.lineTo(x, fillTop + r);
    g.ellipse(cx, fillTop + r, laneW / 2, r, 0, Math.PI, Math.PI * 2);
    g.lineTo(x + laneW, bottom);
    g.fill();
  } else { // guide line down to the ring where the finger starts
    const ringY = bottom - laneW * 0.55;
    g.strokeStyle = "rgba(255,255,255,.85)";
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, top + 14); g.lineTo(cx, ringY - 11); g.stroke();
    g.beginPath(); g.arc(cx, ringY, 11, 0, Math.PI * 2); g.stroke();
  }
}

function drawEffects(t) {
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.font = `700 30px ${SANS}`;
  for (let i = 0; i < MAX_TEXTS; i++) {
    const x = texts[i];
    if (!x.on) continue;
    const age = t - x.t0;
    if (age > TEXT_LIFE) { x.on = false; continue; }
    if (age < 0) continue;
    g.globalAlpha = 1 - age / TEXT_LIFE;
    g.fillText(x.text, x.x, hitY - 36 - age * 60);
  }
  g.globalAlpha = 1;
  if (banner.on) {
    const age = t - banner.t0;
    if (age > BANNER_LIFE) banner.on = false;
    else if (age >= 0) {
      const pop = age < 0.15 ? 0.8 + (age / 0.15) * 0.2 : 1; // quick pop-in, then fade
      g.globalAlpha = Math.min(1, (BANNER_LIFE - age) / 0.4);
      outlined(banner.text, W / 2, H * 0.33, Math.round(34 * pop));
      g.globalAlpha = 1;
    }
  }
}

/** White text with a soft shadow, readable over both tiles and background. */
function outlined(str, x, y, size) {
  g.textAlign = "center";
  g.font = `700 ${size}px ${SANS}`;
  g.lineJoin = "round";
  g.lineWidth = 4;
  g.strokeStyle = "rgba(60,20,90,.45)";
  g.strokeText(str, x, y);
  g.fillStyle = "#fff";
  g.fillText(str, x, y);
}

function star(x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.fill();
}

function drawHud(t) {
  if (judge.score !== scoreVal) { scoreVal = judge.score; scoreStr = scoreVal.toLocaleString(); }
  if (judge.combo !== comboVal) { comboVal = judge.combo; comboStr = comboVal >= 2 ? `\u00d7 ${comboVal}` : ""; }
  const top = safeTop + 10;
  const barX = 16, barW = W - 96, barY = top + 20; // leaves room for the pause button
  const frac = Math.max(0, Math.min(1, t / (hudDuration || 1)));
  g.fillStyle = "rgba(255,255,255,.55)";
  g.fillRect(barX, barY, barW, 3);
  g.fillStyle = "#ffd54a";
  g.fillRect(barX, barY, barW * frac, 3);
  for (let i = 1; i <= 3; i++) star(barX + (barW * i) / 3, barY + 1.5, 10, frac >= i / 3 - 0.001 ? "#ffd54a" : "#fff");
  if (judge.penalty) { // health bar under the song progress bar
    const hf = judge.health / 100;
    g.fillStyle = "rgba(255,255,255,.35)";
    roundRect(g, barX, barY + 16, barW, 6, 3); g.fill();
    if (hf > 0) { g.fillStyle = hf < 0.35 ? "#e03030" : "#58d87a"; roundRect(g, barX, barY + 16, Math.max(6, barW * hf), 6, 3); g.fill(); }
  }
  outlined(scoreStr, W / 2, top + 90, 48);
  if (comboStr) outlined(comboStr, W / 2, top + 118, 18);
  if (!state.settings.soundEnabled) {
    g.textAlign = "right";
    g.fillStyle = "#fff";
    g.font = `12px ${SANS}`;
    g.fillText("Sound off", W - 16, barY + 40);
  }
}

let hudDuration = 1;
export function setSongDuration(seconds) { hudDuration = seconds; }

/** Big 3-2-1 for the opening count-in and the resume countdown. */
function drawBigNumber(n, frac) {
  g.globalAlpha = 1 - frac * 0.6;
  outlined(String(n), W / 2, H * 0.45, Math.round(96 - frac * 12));
  g.globalAlpha = 1;
}
