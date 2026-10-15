// Song Library: lists songs with a Play button. (Bottom sheet, difficulty and stars arrive in Phase 4.)

import { listSongs } from "../songs.js";

let listEl, app;

export function init(appRef) {
  app = appRef;
  listEl = document.getElementById("song-list");
  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-song]");
    if (btn) app.go("gameplay", { songId: btn.dataset.song });
  });
}

export async function enter() {
  const songs = await listSongs();
  listEl.replaceChildren(...songs.map((s) => {
    const li = document.createElement("li");
    li.className = "song-row";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = s.title;
    const credit = document.createElement("span");
    credit.textContent = s.credit;
    info.append(title, credit);
    const play = document.createElement("button");
    play.className = "btn btn--small btn--primary";
    play.type = "button";
    play.dataset.song = s.id;
    play.textContent = "Play";
    li.append(info, play);
    return li;
  }));
}
