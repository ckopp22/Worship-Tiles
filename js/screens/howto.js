// How to Play: swipeable / tap-through cards for the 8 steps (MDD 4.3).

import { state, setProfile } from "../state.js";

const L = [38, 98, 158, 218]; // lane x positions in the 256-wide illustration
const tile = (x, y, extra = "") => `<rect class="art-tile ${extra}" x="${x - 20}" y="${y}" width="40" height="34" rx="8"/>`;
const lanes = `<g stroke="rgba(251,243,220,.2)" stroke-width="1">${[68, 128, 188].map((x) => `<path d="M${x} 0V256"/>`).join("")}</g>`;
const hitLine = `<path class="art-line" d="M8 190H248" stroke-linecap="round"/>`;
const svg = (body) => `<svg class="card-art" viewBox="0 0 256 256" role="img" aria-hidden="true">${body}</svg>`;
const text = (x, y, s, size, fill = "#fbf3dc") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-size="${size}" fill="${fill}">${s}</text>`;

const CARDS = [
  { title: "Watch the notes", body: "Tiles fall down four lanes.",
    art: svg(`${lanes}${hitLine}<g clip-path="inset(0)">${tile(L[0], 0, "fall")}${tile(L[2], 0, "fall d2")}${tile(L[1], 0, "fall d3")}</g>`) },
  { title: "Tap the lane", body: "Tap when a note reaches the glowing line.",
    art: svg(`${lanes}${hitLine}${tile(L[1], 150)}<circle class="tap-ring" cx="${L[1]}" cy="190" r="26" fill="none" stroke="#fff6d8" stroke-width="3"/><circle cx="${L[1]}" cy="190" r="9" fill="#fff6d8"/>`) },
  { title: "Hold long notes", body: "Press and hold tall tiles until the tail passes the line, then let go.",
    art: svg(`${lanes}${hitLine}<rect class="art-tile" x="${L[2] - 20}" y="40" width="40" height="150" rx="10"/><rect x="${L[2] - 5}" y="48" width="10" height="134" rx="5" fill="#f2c460"/><circle class="tap-ring" cx="${L[2]}" cy="190" r="26" fill="none" stroke="#fff6d8" stroke-width="3"/>`) },
  { title: "Play chords", body: "Two joined tiles need two fingers at once. If they're tall, hold both.",
    art: svg(`${lanes}${hitLine}<path d="M${L[0]} 150H${L[2]}" stroke="#f2c460" stroke-width="6" stroke-linecap="round"/>${tile(L[0], 133)}${tile(L[2], 133)}<circle class="tap-ring" cx="${L[0]}" cy="190" r="26" fill="none" stroke="#fff6d8" stroke-width="3"/><circle class="tap-ring" cx="${L[2]}" cy="190" r="26" fill="none" stroke="#fff6d8" stroke-width="3"/>`) },
  { title: "Time it well", body: "Perfect, Great, Good, or Miss. Better timing means more points.",
    art: svg(`${text(128, 70, "Perfect", 30, "#ffe2a0")}${text(128, 115, "Great", 26)}${text(128, 155, "Good", 22, "rgba(251,243,220,.8)")}${text(128, 190, "Miss", 18, "rgba(251,243,220,.5)")}`) },
  { title: "Pick your challenge", body: "Easy, Normal, or Hard for each song. Harder modes earn more coins.",
    art: svg(["Easy", "Normal", "Hard"].map((d, i) => `<rect x="48" y="${50 + i * 56}" width="160" height="42" rx="21" fill="rgba(242,196,96,${0.25 + i * 0.25})" stroke="#f2c460" stroke-width="1.5"/>${text(128, 78 + i * 56, d, 20, i === 2 ? "#2a1c05" : "#fbf3dc")}`).join("")) },
  { title: "Earn and unlock", body: "Your score goes into your Bank. Spend it on more hymns.",
    art: svg(`<circle cx="128" cy="130" r="64" fill="#f2c460" stroke="#a8761c" stroke-width="5"/><circle cx="128" cy="130" r="44" fill="none" stroke="#a8761c" stroke-width="3"/><path d="M122 100h12v22h22v12h-22v22h-12v-22h-22v-12h22z" fill="#a8761c"/>`) },
];

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function init({ go }) {
  const track = document.getElementById("howto-cards");
  const dotsEl = document.getElementById("howto-dots");

  track.innerHTML = CARDS.map((c, i) => `
    <article class="card" aria-label="Step ${i + 1} of ${CARDS.length}">
      ${c.art}
      <p class="card-step">Step ${i + 1} of ${CARDS.length}</p>
      <h3>${c.title}</h3>
      <p>${c.body}</p>
    </article>`).join("");
  dotsEl.innerHTML = CARDS.map(() => '<span class="dot"></span>').join("");
  const dots = [...dotsEl.children];

  const index = () => Math.round(track.scrollLeft / track.clientWidth);
  const showDot = () => dots.forEach((d, i) => d.classList.toggle("is-on", i === index()));
  const goTo = (i) => {
    const n = Math.max(0, Math.min(CARDS.length - 1, i));
    track.scrollTo({ left: n * track.clientWidth, behavior: reduceMotion() ? "auto" : "smooth" });
  };

  track.addEventListener("scroll", showDot, { passive: true });
  document.getElementById("howto-prev").addEventListener("click", () => goTo(index() - 1));
  document.getElementById("howto-next").addEventListener("click", () => goTo(index() + 1));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") goTo(index() - 1);
    if (e.key === "ArrowRight") goTo(index() + 1);
  });
  document.getElementById("howto-done").addEventListener("click", () => {
    if (!state.profile.hasSeenTutorial) setProfile("hasSeenTutorial", true);
    go("menu");
  });
  enter = () => {
    track.scrollTo({ left: 0, behavior: "auto" });
    showDot();
  };
}

// Restart at the first card each time the screen opens (set in init, once sizes are known).
export let enter = () => {};
