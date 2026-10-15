// Results: score, accuracy, max combo and judgment counts. (Stars and Bank reward come in Phase 5.)

let app, lastSongId = null;
const $ = (id) => document.getElementById(id);

export function init(appRef) {
  app = appRef;
  $("results-again").addEventListener("click", () => app.go("gameplay", { songId: lastSongId }));
}

export function enter(run) {
  if (!run) return;
  lastSongId = run.songId;
  $("res-song").textContent = run.title;
  $("res-score").textContent = run.score.toLocaleString();
  $("res-accuracy").textContent = `${run.accuracy.toFixed(1)}%`;
  $("res-combo").textContent = run.maxCombo;
  for (const k of ["perfect", "great", "good", "miss"]) $(`res-${k}`).textContent = run.counts[k];
}
