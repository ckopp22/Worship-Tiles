// Song Library: owned songs (tap for the difficulty sheet), then locked songs dimmed with a price and a
// "Get in Store" shortcut (MDD 4.4).

import { state, setLastDifficulty, isExpertUnlocked } from "../state.js";
import { listSongs, isOwned } from "../songs.js";
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
    if (btn && !btn.disabled) selectDifficulty(btn.dataset.diff);
  });
  $("sheet-play").addEventListener("click", () => {
    setLastDifficulty(current.id, selected);
    closeSheet();
    app.go("gameplay", { songId: current.id, difficulty: selected });
  });
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export async function enter() {
  closeSheet();
  songs = await listSongs();
  const rows = [];

  for (const s of songs.filter(isOwned)) {
    const li = el("li");
    const row = el("button", "song-row");
    row.type = "button";
    row.dataset.song = s.id;
    row.append(el("strong", "", s.title), el("span", "", s.credit));
    li.append(row);
    rows.push(li);
  }

  const locked = songs.filter((s) => !isOwned(s));
  if (locked.length) {
    rows.push(el("li", "list-heading", "Locked"));
    for (const s of locked) {
      const li = el("li", "song-row locked");
      const info = el("div");
      info.append(el("strong", "", s.title), el("span", "", `${s.price.toLocaleString()} coins`));
      const shop = el("button", "btn btn--small", "Get in Store");
      shop.type = "button";
      shop.dataset.go = "store";
      li.append(info, shop);
      rows.push(li);
    }
  }
  listEl.replaceChildren(...rows);
}

function openSheet(id) {
  current = songs.find((s) => s.id === id);
  if (!current) return;
  $("sheet-title").textContent = current.title;
  $("sheet-credit").textContent = current.credit;
  const unlocked = isExpertUnlocked();
  for (const btn of $("sheet-difficulty").children) {
    if (btn.dataset.diff !== "expert") continue;
    btn.disabled = !unlocked;
    btn.textContent = unlocked ? DifficultyConfig.expert.label : "Expert 🔒 (Store)";
  }
  const last = state.profile.lastDifficulty[id];
  selectDifficulty(last in DifficultyConfig && (last !== "expert" || unlocked) ? last : "easy");
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

function buildDifficultyButtons() {
  $("sheet-difficulty").replaceChildren(...DIFFICULTY_ORDER.map((d) => {
    const b = el("button", "seg", DifficultyConfig[d].label);
    b.type = "button";
    b.dataset.diff = d;
    return b;
  }));
}
