// Song Library: list of songs; tapping one opens a bottom sheet with the difficulty selector,
// best score / stars / accuracy for that difficulty, and Play.

import { state, setLastDifficulty } from "../state.js";
import { listSongs } from "../songs.js";
import { DIFFICULTY_ORDER, DifficultyConfig } from "../game/difficulty.js";

let app, listEl, sheet, songs = [], current = null, selected = "easy";
const $ = (id) => document.getElementById(id);

const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);

export function init(appRef) {
  app = appRef;
  listEl = $("song-list");
  sheet = $("song-sheet");
  buildDifficultyButtons();
  listEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-song]");
    if (row) openSheet(row.dataset.song);
  });
  $("sheet-backdrop").addEventListener("click", closeSheet);
  $("sheet-difficulty").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-diff]");
    if (btn) selectDifficulty(btn.dataset.diff);
  });
  $("sheet-play").addEventListener("click", () => {
    setLastDifficulty(current.id, selected);
    closeSheet();
    app.go("gameplay", { songId: current.id, difficulty: selected });
  });
}

export async function enter() {
  closeSheet();
  songs = await listSongs();
  listEl.replaceChildren(...songs.map((s) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.className = "song-row";
    row.type = "button";
    row.dataset.song = s.id;
    const title = document.createElement("strong");
    title.textContent = s.title;
    const credit = document.createElement("span");
    credit.textContent = s.credit;
    row.append(title, credit);
    li.append(row);
    return li;
  }));
}

function openSheet(id) {
  current = songs.find((s) => s.id === id);
  if (!current) return;
  $("sheet-title").textContent = current.title;
  $("sheet-credit").textContent = current.credit;
  selectDifficulty(state.profile.lastDifficulty[id] in DifficultyConfig ? state.profile.lastDifficulty[id] : "easy");
  sheet.hidden = false;
}

function closeSheet() {
  sheet.hidden = true;
}

function selectDifficulty(diff) {
  selected = diff;
  for (const btn of $("sheet-difficulty").children) {
    btn.setAttribute("aria-pressed", String(btn.dataset.diff === diff));
  }
  const best = state.profile.highScores[current.id]?.[diff];
  $("sheet-score").textContent = best ? best.score.toLocaleString() : "—";
  $("sheet-stars").textContent = starText(best?.stars ?? 0);
  $("sheet-accuracy").textContent = best ? `${best.accuracy.toFixed(1)}%` : "—";
  $("sheet-reward").textContent = `Coins ×${DifficultyConfig[diff].bankMultiplier.toFixed(1)}`;
}

// Build the Easy / Normal / Hard buttons once.
export function buildDifficultyButtons() {
  $("sheet-difficulty").replaceChildren(...DIFFICULTY_ORDER.map((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg";
    b.dataset.diff = d;
    b.textContent = DifficultyConfig[d].label;
    return b;
  }));
}
