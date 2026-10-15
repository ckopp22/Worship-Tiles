// Results: difficulty, stars, score, accuracy, combo, judgments, hold / double / chord counts, and the
// Bank reward preview. (The reward is calculated but not added to the Bank until the economy phase.)

import { DifficultyConfig } from "../game/difficulty.js";

let app, last = null;
const $ = (id) => document.getElementById(id);

export function init(appRef) {
  app = appRef;
  $("results-again").addEventListener("click", () => app.go("gameplay", { songId: last.songId, difficulty: last.difficulty }));
}

export function enter(run) {
  if (!run) return;
  last = run;
  $("res-song").textContent = `${run.title} · ${DifficultyConfig[run.difficulty].label}`;
  $("res-stars").textContent = "★".repeat(run.stars) + "☆".repeat(3 - run.stars);
  $("res-stars").setAttribute("aria-label", `${run.stars} of 3 stars`);
  $("res-score").textContent = run.score.toLocaleString();
  $("res-reward").textContent = `Bank reward: ${run.bankReward.toLocaleString()} coins (not added yet)`;
  $("res-accuracy").textContent = `${run.accuracy.toFixed(1)}%`;
  $("res-combo").textContent = run.maxCombo;
  for (const k of ["perfect", "great", "good", "miss"]) $(`res-${k}`).textContent = run.counts[k];
  $("res-holds").textContent = run.holds;
  $("res-doubles").textContent = run.doubles;
  $("res-chords").textContent = run.chords;
}
