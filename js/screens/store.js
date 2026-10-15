// Song Store: locked songs with prices. Buy -> confirm -> deduct from the Bank -> own the song (MDD 4.5).

import { state, subscribe, purchaseSong } from "../state.js";
import { listSongs, isOwned } from "../songs.js";
import { confirmDialog, attachDevBankShortcut } from "../ui.js";

let listEl, balanceEl, statusEl, songs = [], active = false;

export function init() {
  listEl = document.getElementById("store-list");
  balanceEl = document.getElementById("store-bank");
  statusEl = document.getElementById("store-status");
  attachDevBankShortcut(document.getElementById("store-bank-pill")); // DEV shortcut
  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-buy]");
    if (btn && !btn.disabled) buy(btn.dataset.buy);
  });
  subscribe(() => active && render());
}

export async function enter() {
  active = true;
  statusEl.textContent = "";
  songs = await listSongs();
  render();
}

export function leave() {
  active = false;
}

function render() {
  const bank = state.profile.bank;
  balanceEl.textContent = bank.toLocaleString();
  const locked = songs.filter((s) => !isOwned(s));
  if (!locked.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "You own every hymn. More are coming.";
    listEl.replaceChildren(li);
    return;
  }
  listEl.replaceChildren(...locked.map((s) => {
    const li = document.createElement("li");
    li.className = "song-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = s.title;
    const price = document.createElement("span");
    price.textContent = `${s.price.toLocaleString()} coins`;
    info.append(title, price);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.buy = s.id;
    const need = s.price - bank;
    if (need > 0) {
      btn.className = "btn btn--small";
      btn.disabled = true;
      btn.textContent = `Need ${need.toLocaleString()} more`;
    } else {
      btn.className = "btn btn--small btn--primary";
      btn.textContent = "Buy";
    }
    li.append(info, btn);
    return li;
  }));
}

async function buy(id) {
  const song = songs.find((s) => s.id === id);
  if (!song) return;
  const ok = await confirmDialog({
    title: `Unlock ${song.title} for ${song.price.toLocaleString()}?`,
    message: `You have ${state.profile.bank.toLocaleString()} coins.`,
    confirmLabel: "Unlock",
  });
  if (!ok) return;
  statusEl.textContent = purchaseSong(song.id, song.price)
    ? `${song.title} unlocked! Find it in your Library.`
    : "Not enough coins.";
}
