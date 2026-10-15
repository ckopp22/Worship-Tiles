// Results: difficulty, stars (revealed one at a time), score and coin count-up, accuracy, combo, judgments,
// hold / double / chord counts, and a short jingle. The reward was already added to the Bank once, in
// game.js, when the song ended; this screen only animates it, so leaving and coming back can never add it again.

import { DifficultyConfig } from "../game/difficulty.js";
import { playJingle } from "../audio.js";

const COUNT_UP_MS = 1500;
const STAR_DELAY_MS = 450;
let app, last = null, raf = 0, timers = [];
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function init(appRef) {
  app = appRef;
  $("results-again").addEventListener("click", () => app.go("gameplay", { songId: last.songId, difficulty: last.difficulty }));
}

export function enter(run) {
  if (!run) return;
  last = run;
  $("res-title").textContent = run.failed ? "Song Failed" : "Song Complete";
  $("res-song").textContent = `${run.title} · ${DifficultyConfig[run.difficulty].label}`;
  $("res-new-high").hidden = !run.newHigh;
  $("res-stars").setAttribute("aria-label", `${run.stars} of 3 stars`);
  $("res-accuracy").textContent = `${run.accuracy.toFixed(1)}%`;
  $("res-combo").textContent = run.maxCombo;
  for (const k of ["perfect", "great", "good", "miss"]) $(`res-${k}`).textContent = run.counts[k];
  $("res-holds").textContent = run.holds;
  $("res-chords").textContent = run.chords;
  revealStars(run.stars);
  countUp(run);
  if (!run.failed) playJingle();
}

export function leave() {
  cancelAnimationFrame(raf);
  timers.forEach(clearTimeout);
  timers = [];
}

/** Light the earned stars one at a time. */
function revealStars(count) {
  timers.forEach(clearTimeout);
  timers = [];
  const stars = [...$("res-stars").children];
  stars.forEach((s) => s.classList.remove("is-on"));
  stars.slice(0, count).forEach((s, i) => {
    if (reduceMotion.matches) s.classList.add("is-on");
    else timers.push(setTimeout(() => s.classList.add("is-on"), 300 + i * STAR_DELAY_MS));
  });
}

/** Animate the score and "+coins" up from 0 while the Bank total climbs from its old value to the new one. */
function countUp({ score, reward, bankBefore, bankAfter }) {
  cancelAnimationFrame(raf);
  const show = (frac) => {
    $("res-score").textContent = Math.round(score * frac).toLocaleString();
    $("res-earned").textContent = Math.round(reward * frac).toLocaleString();
    $("res-bank").textContent = Math.round(bankBefore + (bankAfter - bankBefore) * frac).toLocaleString();
  };
  if (reduceMotion.matches) { show(1); return; }
  show(0);
  const start = performance.now(); // UI animation only
  const step = (now) => {
    const f = Math.min(1, (now - start) / COUNT_UP_MS);
    show(1 - Math.pow(1 - f, 3));
    if (f < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
