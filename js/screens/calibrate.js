// Timing test: a steady 90 BPM click with one falling tile; the player taps along. After 12 taps the
// average offset (tap time minus beat time) is shown, and "Use this offset" saves it as latencyOffsetMs.
// Positive = the player taps late. The test uses raw audio-clock time, with no offset applied.

import { state, setSetting } from "../state.js";
import { getContext, unlock, scheduleClick } from "../audio.js";

const BEAT = 60 / 90;
const TAPS_NEEDED = 12;
const FALL_SECONDS = 1.6; // tile travel time from the top to the line

let app, canvas, g, stageEl;
let W = 0, H = 0, dpr = 1, hitY = 0;
let running = false, raf = 0, timer = 0;
let t0 = 0, nextBeat = 0, flashAt = -10;
const offsets = [];
const $ = (id) => document.getElementById(id);

/** Metronome timing (beat k lands at t0 + k * beat on the audio clock). */
export const getMetronome = () => ({ t0, beat: BEAT });

export function init(appRef) {
  app = appRef;
  canvas = $("cal-canvas");
  g = canvas.getContext("2d");
  stageEl = $("cal-stage");
  stageEl.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(); });
  $("cal-retry").addEventListener("click", start);
  $("cal-use").addEventListener("click", () => {
    setSetting("latencyOffsetMs", suggestion());
    app.go("settings");
  });
  new ResizeObserver(resize).observe(stageEl);
}

export function enter() {
  window.addEventListener("keydown", onKey);
  $("cal-sound-warning").hidden = state.settings.soundEnabled;
  resize();
  start();
}

export function leave() {
  window.removeEventListener("keydown", onKey);
  stop();
}

function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (!w || !h) return;
  dpr = window.devicePixelRatio || 1;
  W = w; H = h;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  hitY = H * 0.82;
}

async function start() {
  stop();
  unlock();
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state !== "running") await ctx.resume();
  offsets.length = 0;
  $("cal-result").hidden = true;
  $("cal-count").textContent = `Taps: 0 / ${TAPS_NEEDED}`;
  t0 = ctx.currentTime + 1.8;
  nextBeat = 0;
  running = true;
  timer = setInterval(scheduleClicks, 25);
  scheduleClicks();
  raf = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  clearInterval(timer);
  cancelAnimationFrame(raf);
}

/** Look-ahead scheduler: queue clicks a little before they're due so they're sample-accurate. */
function scheduleClicks() {
  const ctx = getContext();
  while (t0 + nextBeat * BEAT < ctx.currentTime + 0.3) {
    scheduleClick(t0 + nextBeat * BEAT);
    nextBeat++;
  }
}

function onKey(e) {
  if (e.code === "Space" || e.code === "KeyJ") { e.preventDefault(); onTap(); }
}

function onTap() {
  if (!running) return;
  const now = getContext().currentTime;
  const k = Math.round((now - t0) / BEAT);
  if (k < 0) return; // before the first beat
  offsets.push((now - (t0 + k * BEAT)) * 1000);
  flashAt = now;
  $("cal-count").textContent = `Taps: ${offsets.length} / ${TAPS_NEEDED}`;
  if (offsets.length >= TAPS_NEEDED) finish();
}

const average = () => offsets.reduce((a, b) => a + b, 0) / offsets.length;
const suggestion = () => Math.max(-200, Math.min(200, Math.round(average() / 5) * 5));

function finish() {
  stop();
  const avg = Math.round(average());
  const sign = avg > 0 ? "+" : "";
  $("cal-average").textContent = `Your average: ${sign}${avg} ms (${avg > 0 ? "late" : avg < 0 ? "early" : "on time"}). Suggested offset: ${suggestion() > 0 ? "+" : ""}${suggestion()} ms.`;
  $("cal-result").hidden = false;
  raf = requestAnimationFrame(frame); // keep drawing the final frame
}

function frame() {
  const ctx = getContext();
  const now = ctx.currentTime;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#0b1a3a";
  g.fillRect(0, 0, W, H);
  const laneW = Math.min(W * 0.5, 160), x = (W - laneW) / 2;
  g.fillStyle = "rgba(251,243,220,.06)";
  g.fillRect(x, 0, laneW, H);

  const age = now - flashAt;
  if (age >= 0 && age < 0.2) { g.fillStyle = `rgba(242,196,96,${0.35 * (1 - age / 0.2)})`; g.fillRect(x, hitY - H * 0.3, laneW, H * 0.3); }
  g.strokeStyle = "#f2c460";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x - 10, hitY); g.lineTo(x + laneW + 10, hitY); g.stroke();

  if (running) {
    const speed = hitY / FALL_SECONDS, tileH = 34;
    const first = Math.max(0, Math.floor((now - t0) / BEAT));
    for (let k = first; k < first + 4; k++) {
      const y = hitY - (t0 + k * BEAT - now) * speed;
      if (y < -tileH || y > H + tileH) continue;
      g.fillStyle = "#f6dc9a";
      g.beginPath(); g.roundRect?.(x + 8, y - tileH / 2, laneW - 16, tileH, 10); g.fill();
      if (!g.roundRect) g.fillRect(x + 8, y - tileH / 2, laneW - 16, tileH);
    }
  }
  if (running || !$("cal-result").hidden) raf = requestAnimationFrame(frame);
}
