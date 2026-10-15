// Timing windows, scoring and combo (MDD 5.4, 5.5). All tuning lives in JUDGE_CONFIG.
// Accuracy % = points earned / (notes x Perfect points); the MDD doesn't define it, so this is the simplest fair choice.

import { LANE_COUNT, NoteState, firstPending } from "./notes.js";

export const JUDGE_CONFIG = {
  windows: { perfect: 0.05, great: 0.1, good: 0.15 }, // seconds either side of the note time
  points: { perfect: 100, great: 70, good: 40, miss: 0 },
  comboTiers: [ // checked top to bottom; combo is the count before this note
    { min: 50, mult: 3 },
    { min: 25, mult: 2 },
    { min: 10, mult: 1.5 },
    { min: 0, mult: 1 },
  ],
};

function multiplierFor(combo) {
  for (const tier of JUDGE_CONFIG.comboTiers) if (combo >= tier.min) return tier.mult;
  return 1;
}

export class Judge {
  /** onResult(note, grade, points) fires for every judged note (hits and misses). */
  constructor(field, onResult) {
    this.field = field;
    this.onResult = onResult;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.basePoints = 0;
  }

  get accuracy() {
    const total = this.field.notes.length;
    return total ? (this.basePoints / (total * JUDGE_CONFIG.points.perfect)) * 100 : 0;
  }

  /** A tap in `lane` at song time t. Returns the grade, or null if no note was close enough (ignored). */
  tap(lane, t) {
    this.update(t);
    const note = firstPending(this.field, lane);
    if (!note) return null;
    const dt = Math.abs(t - note.time);
    const w = JUDGE_CONFIG.windows;
    if (dt > w.good) return null; // empty lane or note too far away: no penalty
    const grade = dt <= w.perfect ? "perfect" : dt <= w.great ? "great" : "good";
    this.apply(note, grade);
    return grade;
  }

  /** Mark notes that have passed the line unhit as Misses. Call every frame. */
  update(t) {
    const cutoff = t - JUDGE_CONFIG.windows.good;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      let note;
      while ((note = firstPending(this.field, lane)) && note.time < cutoff) this.apply(note, "miss");
    }
  }

  apply(note, grade) {
    const base = JUDGE_CONFIG.points[grade];
    note.grade = grade;
    this.counts[grade]++;
    this.basePoints += base;
    let points = 0;
    if (grade === "miss") {
      note.state = NoteState.MISSED;
      this.combo = 0;
    } else {
      note.state = NoteState.HIT;
      points = Math.round(base * multiplierFor(this.combo));
      this.score += points;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    this.onResult(note, grade, points);
  }
}
