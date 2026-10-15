// Gameplay screen flow: loads the song, runs the state machine (loading / playing / paused / resuming /
// finished), wires input to the judge, turns judge events into sound and visuals, and hands the run to Results.
// Timing comes from conductor.js, hit decisions from judge.js, drawing from renderer.js.

import { state, recordResult, addToBank } from "../state.js";
import { playHit as sfxHit, playMiss as sfxMiss } from "../audio.js";
import { loadSong } from "../songs.js";
import * as conductor from "./conductor.js";

/** Hit chime + song at full volume; a miss ducks the song until the next hit. */
const playHit = (grade) => { sfxHit(grade); conductor.boost(); };
const playMiss = () => { sfxMiss(); conductor.duck(); };
import { createField } from "./notes.js";
import { Judge, maxScore } from "./judge.js";
import { DifficultyConfig, starsFor, bankReward } from "./difficulty.js";
import { createInput } from "./input.js";
import * as view from "./renderer.js";
import { hitPulse, holdPulse } from "../haptics.js";

const COMBO_MILESTONES = new Set([10, 25, 50]);

const RESUME_COUNTDOWN_MS = 3000;

let app, canvas, pauseBtn, pauseOverlay, loadingEl, input;
let runState = "idle"; // idle | loading | playing | paused | resuming | starting | finished
let token = 0;         // invalidates async work if the player leaves mid-load
let raf = 0;
let song = null, difficulty = "easy", field = null, judge = null;
let resumeAt = 0;
let prevCombo = 0;

// ======================= setup =======================

export function init(appRef) {
  app = appRef;
  canvas = document.getElementById("game-canvas");
  pauseBtn = document.getElementById("pause-btn");
  pauseOverlay = document.getElementById("pause-overlay");
  loadingEl = document.getElementById("game-loading");
  view.initRenderer(canvas);

  input = createInput(canvas, { onLaneDown, onLaneUp });

  pauseBtn.addEventListener("click", pause);
  document.getElementById("pause-resume").addEventListener("click", beginResume);
  document.getElementById("pause-restart").addEventListener("click", restart);
  document.getElementById("pause-quit").addEventListener("click", () => app.go("library"));

  document.addEventListener("visibilitychange", () => document.hidden && pause());
  window.matchMedia("(orientation: landscape) and (pointer: coarse)").addEventListener("change", (e) => e.matches && pause());
  new ResizeObserver(() => view.resize()).observe(canvas);
}

// ======================= screen lifecycle =======================

/** data: { songId, difficulty } */
export async function enter(data) {
  const my = ++token;
  difficulty = data.difficulty in DifficultyConfig ? data.difficulty : "easy";
  runState = "loading";
  loadingEl.hidden = false;
  pauseOverlay.hidden = true;
  pauseBtn.hidden = true;
  view.resize();
  try {
    song = await loadSong(data.songId, difficulty);
  } catch (err) {
    console.error(err);
    if (my === token) app.go("library");
    return;
  }
  if (my !== token) return;
  await startRun(my);
}

export function leave() {
  token++;
  cancelAnimationFrame(raf);
  input.detach();
  conductor.stop();
  runState = "idle";
}

async function startRun(my) {
  cancelAnimationFrame(raf);
  input.detach();
  field = createField(song.chart);
  judge = new Judge(field, difficulty, onEvent);
  view.setScrollSpeed(DifficultyConfig[difficulty].scrollSpeed, DifficultyConfig[difficulty].tileScale);
  view.setSongDuration(song.buffer.duration);
  view.bindRun(field, judge);
  prevCombo = 0;
  loadingEl.hidden = false;
  try {
    await conductor.start(song.buffer, song.bpm);
  } catch (err) {
    console.error(err);
    if (my === token) app.go("library");
    return;
  }
  if (my !== token) { conductor.stop(); return; }
  loadingEl.hidden = true;
  pauseBtn.hidden = false;
  pauseOverlay.hidden = true;
  runState = "playing";
  input.attach();
  raf = requestAnimationFrame(frame);
}

async function restart() {
  conductor.stop();
  await startRun(token);
}

function finish() {
  runState = "finished";
  judge.update(conductor.songTime() + 5); // flush anything still unresolved
  const best = maxScore(field);
  const stars = starsFor(judge.score, best, difficulty);
  const accuracy = judge.accuracy;
  const newHigh = recordResult(song.id, difficulty, { score: judge.score, stars, accuracy });
  const reward = bankReward(judge.score, difficulty);
  const bankBefore = state.profile.bank;
  addToBank(reward); // finish() runs once per play, so the reward is added exactly once
  app.go("results", {
    songId: song.id,
    title: song.title,
    difficulty,
    score: judge.score,
    accuracy,
    maxCombo: judge.maxCombo,
    counts: { ...judge.counts },
    holds: judge.holdsCompleted,
    doubles: judge.doublesLanded,
    chords: judge.chordsHit,
    stars,
    reward,
    bankBefore,
    bankAfter: state.profile.bank,
    newHigh,
  });
}

// ======================= pause / resume =======================

function pause() {
  if (runState !== "playing" && runState !== "resuming" && runState !== "starting") return;
  runState = "paused";
  judge.releaseAll(conductor.songTime()); // fingers are lost while paused, so holds end here
  pauseOverlay.hidden = false;
  pauseBtn.hidden = true;
  conductor.pause();
}

function beginResume() {
  if (runState !== "paused") return;
  pauseOverlay.hidden = true;
  runState = "resuming";
  resumeAt = performance.now() + RESUME_COUNTDOWN_MS; // UI countdown only; the song clock stays frozen
}

function endResume() {
  runState = "starting";
  conductor.resume().then(() => {
    if (runState === "starting") {
      runState = "playing";
      pauseBtn.hidden = false;
    }
  });
}

// ======================= input & judge events =======================

function onLaneDown(lane) {
  if (runState !== "playing") return;
  const t = conductor.songTime();
  view.flashLane(lane, t);
  judge.tap(lane, t);
}

function onLaneUp(lane) {
  if (runState !== "playing") return;
  judge.release(lane, conductor.songTime());
}

/** Judge callback: sound and visuals for every hit, bonus and break. */
function onEvent(type, note, key) {
  const t = conductor.songTime();
  const mid = note.group ? (view.laneX(note.group.tiles[0].lane) + view.laneX(note.group.tiles[1].lane)) / 2 : view.laneX(note.lane);
  switch (type) {
    case "grade":
      view.spawnLabel(key, view.laneX(note.lane), t, 0);
      if (key === "miss") playMiss();
      else {
        playHit(key);
        hitPulse();
        if (key === "good") view.spawnGlow(view.laneX(note.lane), t);
        else view.spawnBurst(view.laneX(note.lane), t);
      }
      break;
    case "tick":
      view.spawnLabel("tick", view.laneX(note.lane), t, 0);
      playHit(key);
      hitPulse();
      break;
    case "bonus":
      view.spawnLabel(key, key === "holdComplete" ? view.laneX(note.lane) : mid, t, key === "chordHold" ? 2 : 1); // stack above the grade text
      view.spawnBurst(key === "holdComplete" ? view.laneX(note.lane) : mid, t);
      if (key === "holdComplete") holdPulse();
      break;
    case "break":
      playMiss();
      break;
  }
}

// ======================= frame loop =======================

function frame() {
  raf = requestAnimationFrame(frame);
  if (runState === "resuming" && performance.now() >= resumeAt) endResume();
  const t = conductor.songTime();
  if (runState === "playing") {
    judge.update(t);
    if (judge.combo !== prevCombo) {
      if (judge.combo > prevCombo && COMBO_MILESTONES.has(judge.combo)) view.showBanner(`${judge.combo} combo!`, t);
      prevCombo = judge.combo;
    }
    if (t >= conductor.duration()) { finish(); return; }
  }
  let n = 0, frac = 0;
  if (runState === "resuming") {
    const left = (resumeAt - performance.now()) / 1000;
    n = Math.max(1, Math.ceil(left));
    frac = 1 - (left % 1 || 1);
  } else if (runState === "playing") {
    n = conductor.countInNumber(t);
    frac = n ? 1 - ((-t / conductor.beatLength()) % 1 || 1) : 0;
  }
  view.draw(t, n, frac);
}
