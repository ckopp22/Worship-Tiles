// Results: difficulty, stars, score, accuracy, combo, judgments, hold / double / chord counts, and the
// Bank reward. The reward was already added to the Bank once, in game.js, when the song ended; this
// screen only animates it, so leaving and coming back can never add it again.

import { DifficultyConfig } from "../game/difficulty.js";

const COUNT_UP_MS = 1500;
let app, last = null, raf = 0;
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function init(appRef) {
  app = appRef;
  $("results-again").addEventListener("click", () => app.go("gameplay", { songId: last.songId, difficulty: last.difficulty }));
}

export function enter(run) {
  if (!run) return;
  last = run;
  $("res-song").textContent = `${run.title} · ${DifficultyConfig[run.difficulty].label}`;
  $("res-new-high").hidden = !run.newHigh;
  $("res-stars").textContent = "★".repeat(run.stars) + "☆".repeat(3 - run.stars);
  $("res-stars").setAttribute("aria-label", `${run.stars} of 3 stars`);
  $("res-score").textContent = run.score.toLocaleString();
  $("res-accuracy").textContent = `${run.accuracy.toFixed(1)}%`;
  $("res-combo").textContent = run.maxCombo;
  for (const k of ["perfect", "great", "good", "miss"]) $(`res-${k}`).textContent = run.counts[k];
  $("res-holds").textContent = run.holds;
  $("res-doubles").textContent = run.doubles;
  $("res-chords").textContent = run.chords;
  countUp(run);
}

export function leave() {
  cancelAnimationFrame(raf);
}

/** Animate "+coins" up from 0 while the Bank total climbs from its old value to the new one. */
function countUp({ reward, bankBefore, bankAfter }) {
  cancelAnimationFrame(raf);
  const show = (frac) => {
    $("res-earned").textContent = Math.round(reward * frac).toLocaleString();
    $("res-bank").textContent = Math.round(bankBefore + (bankAfter - bankBefore) * frac).toLocaleString();
  };
  if (reduceMotion.matches || reward === 0) { show(1); return; }
  show(0);
  const start = performance.now(); // UI animation only
  const step = (now) => {
    const f = Math.min(1, (now - start) / COUNT_UP_MS);
    show(1 - Math.pow(1 - f, 3));
    if (f < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
