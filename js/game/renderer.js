// Canvas rendering for the gameplay screen: layout, pre-rendered sprites, notes (tap / hold / double /
// chord), floating labels, particles and the HUD. Pools are preallocated so frames create no objects.

import { state } from "../state.js";
import { LANE_COUNT, Kind, NoteState } from "./notes.js";

const HIT_LINE_FROM_BOTTOM = 0.17; // fraction of screen height, measured above the bottom safe area
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TILE_COLORS = ["#f6dc9a", "#f3c9a8", "#b9d2f5", "#bfe3c8"]; // muted stained-glass tints

const LABELS = {
  perfect: { text: "Perfect", color: "#ffe2a0" },
  great: { text: "Great", color: "#fbf3dc" },
  good: { text: "Good", color: "#9fc3ff" },
  miss: { text: "Miss", color: "#e58a8a" },
  tick: { text: "1/2", color: "#fbf3dc" },
  double: { text: "Double", color: "#ffd27a" },
  chord: { text: "Chord", color: "#ffd27a" },
  holdComplete: { text: "Hold Complete", color: "#ffe2a0" },
  chordHold: { text: "Chord Hold Complete", color: "#ffd27a" },
};
const TEXT_LIFE = 0.7, BURST_LIFE = 0.45, FLASH_LIFE = 0.25;
const MAX_TEXTS = 10, MAX_PARTICLES = 128, BURST_COUNT = 10;
const MAX_GLOWS = 6, GLOW_LIFE = 0.4, BANNER_LIFE = 1.2, MISS_FADE = 0.8, MOTE_COUNT = 26;

let canvas, g, probe;
let W = 0, H = 0, dpr = 1, safeTop = 0, safeBottom = 0;
let laneW = 0, hitY = 0, speed = 0, tileW = 0, tileH = 0, offscreenTime = 0;
let scrollScreens = 0.55, tileScale = 1;
let bgCanvas = null, flashCanvas = null, flashH = 0;
const tileSprites = [], doubleSprites = [];
const spritePad = 12;

let field = null, judge = null, firstVisible = 0;
let scoreStr = "0", scoreVal = 0, comboStr = "", comboVal = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const laneFlash = new Array(LANE_COUNT).fill(-10);
const texts = Array.from({ length: MAX_TEXTS }, () => ({ on: false, label: null, x: 0, t0: 0, level: 0 }));
const particles = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, t0: 0 }));
let textNext = 0, particleNext = 0;

const glows = Array.from({ length: MAX_GLOWS }, () => ({ on: false, x: 0, t0: 0 }));
let glowNext = 0, glowCanvas = null, glowSize = 0;
const banner = { on: false, text: "", t0: 0 };

// drifting gold dust: fixed fractions (no randomness), positions computed from song time each frame
const motes = Array.from({ length: MOTE_COUNT }, (_, i) => ({
  fx: (i * 0.618034) % 1, fy: (i * 0.381966 + 0.13) % 1, speed: 6 + (i % 5) * 3, r: 1 + (i % 3) * 0.6, phase: i,
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
  tileW = laneW - 16;
  tileH = Math.max(34, laneW * 0.42) * tileScale;
  applySpeed();
  buildBackground();
  buildSprites();
  return true;
}

/** Scroll speed in screen heights per second (from DifficultyConfig). */
export function setScrollSpeed(screensPerSecond, scale = 1) {
  scrollScreens = screensPerSecond;
  const rescale = scale !== tileScale;
  tileScale = scale;
  if (H && rescale) { tileH = Math.max(34, laneW * 0.42) * tileScale; buildSprites(); }
  if (H) applySpeed();
}

function applySpeed() {
  speed = H * scrollScreens;
  offscreenTime = (H - hitY + tileH) / speed;  // seconds for a tile to leave the bottom after the line
}

/** Attach the current run's notes and judge; clears all effects. */
export function bindRun(fieldRef, judgeRef) {
  field = fieldRef;
  judge = judgeRef;
  firstVisible = 0;
  scoreStr = "0"; scoreVal = 0; comboStr = ""; comboVal = 0;
  laneFlash.fill(-10);
  texts.forEach((x) => (x.on = false));
  particles.forEach((p) => (p.on = false));
  glows.forEach((x) => (x.on = false));
  banner.on = false;
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

/** Static layer: gradient, lane dividers, glowing hit line, target rings; plus the lane flash sprite. */
function buildBackground() {
  let x;
  [bgCanvas, x] = makeLayer(W, H);
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#060f2b");
  grad.addColorStop(0.55, "#0f2250");
  grad.addColorStop(1, "#1d2e58");
  x.fillStyle = grad;
  x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, hitY, 0, W / 2, hitY, W);
  glow.addColorStop(0, "rgba(242,196,96,.20)");
  glow.addColorStop(1, "rgba(242,196,96,0)");
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);

  x.strokeStyle = "rgba(251,243,220,.10)";
  x.lineWidth = 1;
  for (let i = 1; i < LANE_COUNT; i++) {
    x.beginPath(); x.moveTo(i * laneW, 0); x.lineTo(i * laneW, H); x.stroke();
  }
  x.shadowColor = "#f2c460";
  x.shadowBlur = 14;
  x.strokeStyle = "#f2c460";
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, hitY); x.lineTo(W, hitY); x.stroke();
  x.shadowBlur = 0;
  x.strokeStyle = "rgba(242,196,96,.35)";
  x.lineWidth = 2;
  for (let i = 0; i < LANE_COUNT; i++) {
    x.beginPath(); x.arc((i + 0.5) * laneW, hitY, laneW * 0.3, 0, Math.PI * 2); x.stroke();
  }

  flashH = H * 0.35;
  let fx;
  [flashCanvas, fx] = makeLayer(laneW, flashH);
  const fg = fx.createLinearGradient(0, 0, 0, flashH);
  fg.addColorStop(0, "rgba(242,196,96,0)");
  fg.addColorStop(1, "rgba(242,196,96,.4)");
  fx.fillStyle = fg;
  fx.fillRect(0, 0, laneW, flashH);

  // soft round glow for Good hits
  glowSize = laneW * 1.3;
  let gx;
  [glowCanvas, gx] = makeLayer(glowSize, glowSize);
  const rg = gx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
  rg.addColorStop(0, "rgba(159,195,255,.55)");
  rg.addColorStop(1, "rgba(159,195,255,0)");
  gx.fillStyle = rg;
  gx.fillRect(0, 0, glowSize, glowSize);
}

/** One glowing rounded tile per lane, plus a "2" variant for double-taps. */
function buildSprites() {
  tileSprites.length = 0;
  doubleSprites.length = 0;
  for (let i = 0; i < LANE_COUNT; i++) {
    for (const withTwo of [false, true]) {
      const [c, x] = makeLayer(tileW + spritePad * 2, tileH + spritePad * 2);
      x.shadowColor = TILE_COLORS[i];
      x.shadowBlur = 12;
      const grad = x.createLinearGradient(0, spritePad, 0, spritePad + tileH);
      grad.addColorStop(0, "#fffaf0");
      grad.addColorStop(1, TILE_COLORS[i]);
      x.fillStyle = grad;
      roundRect(x, spritePad, spritePad, tileW, tileH, 10);
      x.fill();
      x.shadowBlur = 0;
      x.strokeStyle = "rgba(255,255,255,.7)";
      x.lineWidth = 1.5;
      x.stroke();
      if (withTwo) {
        const cx = spritePad + tileW / 2, cy = spritePad + tileH / 2;
        x.strokeStyle = "rgba(42,28,5,.55)";
        x.lineWidth = 2;
        x.beginPath(); x.arc(cx, cy, tileH * 0.36, 0, Math.PI * 2); x.stroke(); // twin-ring marker
        x.beginPath(); x.arc(cx, cy, tileH * 0.25, 0, Math.PI * 2); x.stroke();
        x.fillStyle = "#2a1c05";
        x.font = `700 ${Math.round(tileH * 0.42)}px ${SERIF}`;
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText("2", cx, cy + 1);
      }
      (withTwo ? doubleSprites : tileSprites).push(c);
    }
  }
}

// ======================= effects =======================

export function flashLane(lane, t) { laneFlash[lane] = t; }

/** Floating label centered on `x` (px). level 1 floats above level 0 so bonuses don't overlap grades. */
export function spawnLabel(key, x, t, level) {
  const slot = texts[textNext++ % MAX_TEXTS];
  slot.on = true; slot.label = LABELS[key]; slot.x = x; slot.t0 = t; slot.level = level;
}

export function spawnBurst(x, t) {
  if (reduceMotion.matches) return;
  for (let i = 0; i < BURST_COUNT; i++) {
    const p = particles[particleNext++ % MAX_PARTICLES];
    const a = -Math.PI * (0.1 + 0.8 * Math.random());
    const v = 90 + Math.random() * 130;
    p.on = true; p.x = x; p.y = hitY; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.t0 = t;
  }
}

/** Gentle glow on the hit line (Good hits). */
export function spawnGlow(x, t) {
  const slot = glows[glowNext++ % MAX_GLOWS];
  slot.on = true; slot.x = x; slot.t0 = t;
}

/** Brief banner such as "10 combo!". */
export function showBanner(text, t) {
  banner.on = true; banner.text = text; banner.t0 = t;
}

export const activeParticleCount = () => particles.reduce((n, p) => n + (p.on ? 1 : 0), 0);

export const laneX = (lane) => (lane + 0.5) * laneW;

// ======================= drawing =======================

export function draw(t, bigNumber, bigFrac) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(bgCanvas, 0, 0, W, H);
  if (!reduceMotion.matches) drawMotes(t);
  drawFlashes(t);
  drawNotes(t);
  drawEffects(t);
  drawHud(t);
  if (bigNumber) drawBigNumber(bigNumber, bigFrac);
}

function drawMotes(t) {
  g.fillStyle = "#ffe2a0";
  for (let i = 0; i < MOTE_COUNT; i++) {
    const m = motes[i];
    const y = (((m.fy * H - t * m.speed) % H) + H) % H;
    g.globalAlpha = 0.12 + 0.12 * Math.sin(t * 0.8 + m.phase);
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
    g.drawImage(flashCanvas, i * laneW, hitY - flashH + 4, laneW, flashH);
  }
  g.globalAlpha = 1;
}

/** A missed tile quietly fades out instead of lingering. */
const missFade = (n, t) => Math.max(0, 1 - (t - n.hitT) / MISS_FADE);

/** Y of a tile's head: held holds stay pinned to the hit line while their body shrinks. */
const headY = (n, t) => (n.state === NoteState.HELD ? hitY : hitY - (n.time - t) * speed);

function drawNotes(t) {
  const notes = field.notes;
  // skip tiles (including long hold tails) that have fully scrolled off the bottom
  while (firstVisible < notes.length && notes[firstVisible].end < t - offscreenTime) firstVisible++;
  const pulse = 0.5 + 0.5 * Math.sin(t * 14);

  // pass 1: chord bars and hold bodies sit behind the tiles
  for (let i = firstVisible; i < notes.length; i++) {
    const n = notes[i];
    if ((n.time - t) * speed > hitY + tileH) break; // not on screen yet (sorted by head time)
    if (n.state === NoteState.HIT) continue;
    const y = headY(n, t);

    if (n.group && n === n.group.tiles[0]) {
      const o = n.group.tiles[1];
      const live = (s) => s === NoteState.PENDING || s === NoteState.HELD;
      if (live(n.state) && live(o.state)) {
        g.lineCap = "round";
        g.strokeStyle = "#f2c460";
        g.globalAlpha = 0.28; g.lineWidth = 16;
        g.beginPath(); g.moveTo(laneX(n.lane), y); g.lineTo(laneX(o.lane), y); g.stroke();
        g.globalAlpha = 0.95; g.lineWidth = 5;
        g.stroke();
      }
    }

    if (n.kind === Kind.HOLD) {
      const tailY = hitY - (n.end - t) * speed;
      if (tailY >= y) continue;
      const held = n.state === NoteState.HELD;
      const missed = n.state === NoteState.MISSED;
      const dim = missed || n.state === NoteState.BROKEN;
      const a = missed ? 0.3 * missFade(n, t) : dim ? 0.25 : 1;
      const cx = laneX(n.lane), bw = tileW * 0.6;
      g.fillStyle = TILE_COLORS[n.lane];
      g.globalAlpha = a * (held ? 0.22 + 0.2 * pulse : 0.18);       // soft glow
      roundRect(g, cx - tileW * 0.45, tailY - 6, tileW * 0.9, y - tailY + 6, 14); g.fill();
      g.globalAlpha = a * (held ? 0.75 + 0.25 * pulse : 0.6);       // body
      roundRect(g, cx - bw / 2, tailY, bw, y - tailY, 9); g.fill();
      g.globalAlpha = a;                                            // glowing tail cap
      g.fillStyle = "#fff6d8";
      g.beginPath(); g.arc(cx, tailY + 3, bw * 0.3, 0, Math.PI * 2); g.fill();
      if (held) { // lane glow while the hold is down
        g.globalAlpha = 0.35 + 0.35 * pulse;
        g.drawImage(flashCanvas, n.lane * laneW, hitY - flashH + 4, laneW, flashH);
      }
    }
  }

  // pass 2: tile heads
  const sw = tileW + spritePad * 2, sh = tileH + spritePad * 2;
  for (let i = firstVisible; i < notes.length; i++) {
    const n = notes[i];
    if ((n.time - t) * speed > hitY + tileH) break;
    if (n.state === NoteState.HIT) continue;
    const held = n.state === NoteState.HELD;
    g.globalAlpha = n.state === NoteState.MISSED ? 0.4 * missFade(n, t)
      : n.state === NoteState.BROKEN ? 0.3
      : held ? 0.85 + 0.15 * pulse : 1;
    if (g.globalAlpha <= 0) continue;
    const sprite = (n.kind === Kind.DOUBLE ? doubleSprites : tileSprites)[n.lane];
    g.drawImage(sprite, n.lane * laneW + (laneW - sw) / 2, headY(n, t) - sh / 2, sw, sh);
  }
  g.globalAlpha = 1;
}

function drawEffects(t) {
  g.fillStyle = "#ffe2a0";
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (!p.on) continue;
    const age = t - p.t0;
    if (age > BURST_LIFE) { p.on = false; continue; }
    if (age < 0) continue;
    g.globalAlpha = 1 - age / BURST_LIFE;
    g.beginPath();
    g.arc(p.x + p.vx * age, p.y + p.vy * age + 260 * age * age, 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < MAX_GLOWS; i++) {
    const x = glows[i];
    if (!x.on) continue;
    const age = t - x.t0;
    if (age > GLOW_LIFE) { x.on = false; continue; }
    if (age < 0) continue;
    g.globalAlpha = 1 - age / GLOW_LIFE;
    g.drawImage(glowCanvas, x.x - glowSize / 2, hitY - glowSize / 2, glowSize, glowSize);
  }
  g.textAlign = "center";
  g.font = `700 19px ${SERIF}`;
  for (let i = 0; i < MAX_TEXTS; i++) {
    const x = texts[i];
    if (!x.on) continue;
    const age = t - x.t0;
    if (age > TEXT_LIFE) { x.on = false; continue; }
    if (age < 0) continue;
    g.globalAlpha = 1 - age / TEXT_LIFE;
    g.fillStyle = x.label.color;
    const cx = Math.max(60, Math.min(W - 60, x.x)); // keep wide labels on screen
    g.fillText(x.label.text, cx, hitY - 36 - x.level * 26 - age * 40);
  }
  g.globalAlpha = 1;
  if (banner.on) {
    const age = t - banner.t0;
    if (age > BANNER_LIFE) banner.on = false;
    else if (age >= 0) {
      const pop = age < 0.15 ? 0.8 + (age / 0.15) * 0.2 : 1; // quick pop-in, then fade
      g.globalAlpha = Math.min(1, (BANNER_LIFE - age) / 0.4);
      g.fillStyle = "#ffe2a0";
      g.font = `700 ${Math.round(34 * pop)}px ${SERIF}`;
      g.textAlign = "center";
      g.fillText(banner.text, W / 2, H * 0.3);
      g.globalAlpha = 1;
    }
  }
}

function drawHud(t) {
  if (judge.score !== scoreVal) { scoreVal = judge.score; scoreStr = scoreVal.toLocaleString(); }
  if (judge.combo !== comboVal) { comboVal = judge.combo; comboStr = comboVal >= 2 ? `${comboVal} combo` : ""; }
  const top = safeTop + 10;
  g.textAlign = "left";
  g.fillStyle = "#f2c460";
  g.font = `600 26px ${SERIF}`;
  g.fillText(scoreStr, 16, top + 28);
  if (comboStr) {
    g.textAlign = "center";
    g.fillStyle = "#fbf3dc";
    g.font = `600 16px ${SANS}`;
    g.fillText(comboStr, W / 2, top + 26);
  }
  const barX = 16, barW = W - 32, barY = top + 54;
  const frac = Math.max(0, Math.min(1, t / (hudDuration || 1)));
  g.fillStyle = "rgba(251,243,220,.2)";
  roundRect(g, barX, barY, barW, 4, 2); g.fill();
  if (frac > 0) { g.fillStyle = "#f2c460"; roundRect(g, barX, barY, Math.max(4, barW * frac), 4, 2); g.fill(); }
  if (!state.settings.soundEnabled) {
    g.textAlign = "right";
    g.fillStyle = "rgba(251,243,220,.7)";
    g.font = `12px ${SANS}`;
    g.fillText("Sound off", W - 16, barY + 22);
  }
}

let hudDuration = 1;
export function setSongDuration(seconds) { hudDuration = seconds; }

/** Big 3-2-1 for the opening count-in and the resume countdown. */
function drawBigNumber(n, frac) {
  g.globalAlpha = 1 - frac * 0.6;
  g.textAlign = "center";
  g.fillStyle = "#fff6d8";
  g.font = `700 ${96 - frac * 12}px ${SERIF}`;
  g.fillText(String(n), W / 2, H * 0.4);
  g.globalAlpha = 1;
}
