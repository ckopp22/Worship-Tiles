// Gameplay screen: canvas rendering (4 lanes, tiles, HUD, effects), the run state machine
// (loading / playing / paused / resuming / finished) and pause handling.
// Timing comes from conductor.js; hit decisions from judge.js; lane presses from input.js.

import { state } from "../state.js";
import { playHit, playMiss } from "../audio.js";
import { loadSong } from "../songs.js";
import * as conductor from "./conductor.js";
import { LANE_COUNT, NoteState, createField } from "./notes.js";
import { Judge } from "./judge.js";
import { createInput } from "./input.js";

export const GAME_CONFIG = {
  scrollSpeed: 0.55,      // screen heights per second; tiles reach the hit line exactly at chart time
  hitLineFromBottom: 0.17, // fraction of screen height, measured above the bottom safe area
  resumeCountdownMs: 3000,
};

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TILE_COLORS = ["#f6dc9a", "#f3c9a8", "#b9d2f5", "#bfe3c8"]; // muted stained-glass tints
const GRADE_STYLE = {
  perfect: { text: "Perfect", color: "#ffe2a0" },
  great: { text: "Great", color: "#fbf3dc" },
  good: { text: "Good", color: "#9fc3ff" },
  miss: { text: "Miss", color: "#e58a8a" },
};
const TEXT_LIFE = 0.7;
const BURST_LIFE = 0.45;
const FLASH_LIFE = 0.25;
const MAX_TEXTS = 8;
const MAX_PARTICLES = 96;
const BURST_COUNT = 10;

// ---- DOM / canvas ----
let app, canvas, g, pauseBtn, pauseOverlay, loadingEl, input;
const probe = document.createElement("div"); // reads safe-area insets as pixels
probe.style.cssText = "position:absolute;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";

// ---- layout (CSS px) ----
let W = 0, H = 0, dpr = 1, safeTop = 0, safeBottom = 0;
let laneW = 0, hitY = 0, speed = 0, tileW = 0, tileH = 0, spritePad = 12, offscreenTime = 0;
let bgCanvas = null, flashCanvas = null, flashH = 0;
const tileSprites = [];

// ---- run state ----
let runState = "idle"; // idle | loading | playing | paused | resuming | starting | finished
let token = 0;         // invalidates async work if the player leaves mid-load
let raf = 0;
let song = null, field = null, judge = null;
let firstVisible = 0;
let resumeAt = 0;
let scoreStr = "0", scoreVal = 0, comboStr = "", comboVal = 0;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ---- effect pools (preallocated, reused) ----
const laneFlash = new Array(LANE_COUNT).fill(-10);
const texts = Array.from({ length: MAX_TEXTS }, () => ({ on: false, s: "", color: "", x: 0, t0: 0 }));
const particles = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, t0: 0 }));
let textNext = 0, particleNext = 0;

function resetEffects() {
  laneFlash.fill(-10);
  texts.forEach((x) => (x.on = false));
  particles.forEach((p) => (p.on = false));
}

// ======================= setup =======================

export function init(appRef) {
  app = appRef;
  canvas = document.getElementById("game-canvas");
  g = canvas.getContext("2d");
  pauseBtn = document.getElementById("pause-btn");
  pauseOverlay = document.getElementById("pause-overlay");
  loadingEl = document.getElementById("game-loading");
  canvas.parentElement.appendChild(probe);

  input = createInput(canvas, { onLaneDown, onLaneUp: () => {} });

  pauseBtn.addEventListener("click", pause);
  document.getElementById("pause-resume").addEventListener("click", beginResume);
  document.getElementById("pause-restart").addEventListener("click", restart);
  document.getElementById("pause-quit").addEventListener("click", () => app.go("library"));

  document.addEventListener("visibilitychange", () => document.hidden && pause());
  window.matchMedia("(orientation: landscape) and (pointer: coarse)").addEventListener("change", (e) => e.matches && pause());
  new ResizeObserver(resize).observe(canvas);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return; // screen hidden
  dpr = window.devicePixelRatio || 1;
  W = w; H = h;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const cs = getComputedStyle(probe);
  safeTop = parseFloat(cs.paddingTop) || 0;
  safeBottom = parseFloat(cs.paddingBottom) || 0;

  laneW = W / LANE_COUNT;
  hitY = H - safeBottom - H * GAME_CONFIG.hitLineFromBottom;
  speed = H * GAME_CONFIG.scrollSpeed;
  tileW = laneW - 16;
  tileH = Math.max(34, laneW * 0.42);
  offscreenTime = (H - hitY + tileH) / speed;
  buildBackground();
  buildTileSprites();
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

/** Static layer: gradient, lane dividers, glowing hit line, target rings. */
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

  // lane flash sprite: gold fading up from the hit line
  flashH = H * 0.35;
  let fx;
  [flashCanvas, fx] = makeLayer(laneW, flashH);
  const fg = fx.createLinearGradient(0, 0, 0, flashH);
  fg.addColorStop(0, "rgba(242,196,96,0)");
  fg.addColorStop(1, "rgba(242,196,96,.4)");
  fx.fillStyle = fg;
  fx.fillRect(0, 0, laneW, flashH);
}

/** Pre-render one glowing rounded tile per lane so drawing a tile is a single drawImage. */
function buildTileSprites() {
  tileSprites.length = 0;
  for (let i = 0; i < LANE_COUNT; i++) {
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
    tileSprites.push(c);
  }
}

// ======================= screen lifecycle =======================

export async function enter(data) {
  const my = ++token;
  runState = "loading";
  loadingEl.hidden = false;
  pauseOverlay.hidden = true;
  pauseBtn.hidden = true;
  resize();
  try {
    song = await loadSong(data.songId);
  } catch (err) {
    console.error(err);
    if (my === token) app.go("library");
    return;
  }
  if (my !== token) return;
  await startRun(my);
}

export function leave() {
  token++;
  cancelAnimationFrame(raf);
  input.detach();
  conductor.stop();
  runState = "idle";
}

async function startRun(my) {
  cancelAnimationFrame(raf);
  input.detach();
  field = createField(song.chart);
  judge = new Judge(field, onResult);
  firstVisible = 0;
  resetEffects();
  scoreStr = "0"; scoreVal = 0; comboStr = ""; comboVal = 0;
  loadingEl.hidden = false;
  try {
    await conductor.start(song.buffer, song.bpm);
  } catch (err) {
    console.error(err);
    if (my === token) app.go("library");
    return;
  }
  if (my !== token) { conductor.stop(); return; }
  loadingEl.hidden = true;
  pauseBtn.hidden = false;
  pauseOverlay.hidden = true;
  runState = "playing";
  input.attach();
  raf = requestAnimationFrame(frame);
}

async function restart() {
  conductor.stop();
  await startRun(token);
}

function finish() {
  runState = "finished";
  const run = {
    songId: song.id,
    title: song.title,
    score: judge.score,
    accuracy: judge.accuracy,
    maxCombo: judge.maxCombo,
    counts: { ...judge.counts },
  };
  app.go("results", run);
}

// ======================= pause / resume =======================

function pause() {
  if (runState !== "playing" && runState !== "resuming" && runState !== "starting") return;
  runState = "paused";
  pauseOverlay.hidden = false;
  pauseBtn.hidden = true;
  conductor.pause();
}

function beginResume() {
  if (runState !== "paused") return;
  pauseOverlay.hidden = true;
  runState = "resuming";
  resumeAt = performance.now() + GAME_CONFIG.resumeCountdownMs; // UI countdown only; the song clock stays frozen
}

function endResume() {
  runState = "starting";
  conductor.resume().then(() => {
    if (runState === "starting") {
      runState = "playing";
      pauseBtn.hidden = false;
    }
  });
}

// ======================= input & judging =======================

function onLaneDown(lane) {
  if (runState !== "playing") return;
  const t = conductor.songTime();
  laneFlash[lane] = t;
  const grade = judge.tap(lane, t);
  if (grade) playHit(grade);
}

/** Called by the judge for every hit and miss. */
function onResult(note, grade, points) {
  const t = conductor.songTime();
  const x = (note.lane + 0.5) * laneW;
  const slot = texts[textNext++ % MAX_TEXTS];
  slot.on = true; slot.s = GRADE_STYLE[grade].text; slot.color = GRADE_STYLE[grade].color; slot.x = x; slot.t0 = t;
  if (grade === "miss") {
    playMiss();
  } else if ((grade === "perfect" || grade === "great") && !reduceMotion.matches) {
    for (let i = 0; i < BURST_COUNT; i++) {
      const p = particles[particleNext++ % MAX_PARTICLES];
      const a = -Math.PI * (0.1 + 0.8 * Math.random());
      const v = 90 + Math.random() * 130;
      p.on = true; p.x = x; p.y = hitY; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.t0 = t;
    }
  }
}

// ======================= frame loop & drawing =======================

function frame() {
  raf = requestAnimationFrame(frame);
  if (runState === "resuming" && performance.now() >= resumeAt) endResume();
  const t = conductor.songTime();
  if (runState === "playing") {
    judge.update(t);
    if (t >= conductor.duration()) { finish(); return; }
  }
  draw(t);
}

function draw(t) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(bgCanvas, 0, 0, W, H);
  drawFlashes(t);
  drawNotes(t);
  drawEffects(t);
  drawHud(t);
  drawBigNumber(t);
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

function drawNotes(t) {
  const notes = field.notes;
  const travel = hitY / speed; // seconds from spawn (top of screen) to the hit line
  // skip notes that have scrolled off the bottom
  while (firstVisible < notes.length && notes[firstVisible].time < t - offscreenTime) firstVisible++;
  const spriteW = tileW + spritePad * 2, spriteH = tileH + spritePad * 2;
  for (let i = firstVisible; i < notes.length; i++) {
    const n = notes[i];
    if (n.time - t > travel + tileH / speed) break; // not on screen yet (notes are sorted)
    if (n.state === NoteState.HIT) continue;
    const y = hitY - (n.time - t) * speed;
    g.globalAlpha = n.state === NoteState.MISSED ? 0.3 : 1;
    g.drawImage(tileSprites[n.lane], n.lane * laneW + (laneW - spriteW) / 2, y - spriteH / 2, spriteW, spriteH);
  }
  g.globalAlpha = 1;
}

function drawEffects(t) {
  g.fillStyle = "#ffe2a0";
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (!p.on) continue;
    const age = t - p.t0;
    if (age < 0 || age > BURST_LIFE) { if (age > BURST_LIFE) p.on = false; continue; }
    g.globalAlpha = 1 - age / BURST_LIFE;
    g.beginPath();
    g.arc(p.x + p.vx * age, p.y + p.vy * age + 260 * age * age, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = "center";
  g.font = `700 20px ${SERIF}`;
  for (let i = 0; i < MAX_TEXTS; i++) {
    const x = texts[i];
    if (!x.on) continue;
    const age = t - x.t0;
    if (age < 0 || age > TEXT_LIFE) { if (age > TEXT_LIFE) x.on = false; continue; }
    g.globalAlpha = 1 - age / TEXT_LIFE;
    g.fillStyle = x.color;
    g.fillText(x.s, x.x, hitY - 36 - age * 40);
  }
  g.globalAlpha = 1;
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
  // song progress bar
  const barX = 16, barW = W - 32, barY = top + 54;
  const frac = Math.max(0, Math.min(1, t / (conductor.duration() || 1)));
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

/** Big 3-2-1 for the opening count-in and for the resume countdown. */
function drawBigNumber(t) {
  let n = 0, frac = 0;
  if (runState === "resuming") {
    const left = (resumeAt - performance.now()) / 1000;
    n = Math.max(1, Math.ceil(left)); frac = 1 - (left % 1 || 1);
  } else if (runState === "playing" || runState === "paused") {
    n = conductor.countInNumber(t);
    frac = n ? 1 - ((-t / conductor.beatLength()) % 1 || 1) : 0;
  }
  if (!n || runState === "paused") return;
  g.globalAlpha = 1 - frac * 0.6;
  g.textAlign = "center";
  g.fillStyle = "#fff6d8";
  g.font = `700 ${96 - frac * 12}px ${SERIF}`;
  g.fillText(String(n), W / 2, H * 0.4);
  g.globalAlpha = 1;
}
