// Timing windows, scoring and combo for every note type (MDD 5.4, 5.5). Tuning lives in JUDGE_CONFIG.
// Judge reports what happened through onEvent(type, note, key, points):
//   "grade" (key = perfect/great/good/miss), "tick" (double-tap first tap), "bonus" (key = double /
//   chord / holdComplete / chordHold), "break" (hold released early).
// Accuracy % = head points earned / (tiles x Perfect points); the MDD doesn't define it. Bonuses only affect score.

import { LANE_COUNT, Kind, NoteState, CHORD_WINDOW, DOUBLE_WINDOW, firstActive } from "./notes.js";
import { DifficultyConfig } from "./difficulty.js";

export const JUDGE_CONFIG = {
  windows: { perfect: 0.05, great: 0.1, good: 0.15 }, // seconds either side of the note time (Normal)
  points: { perfect: 100, great: 70, good: 40, miss: 0 },
  comboTiers: [ // checked top to bottom; combo is the count before this note
    { min: 50, mult: 3 },
    { min: 25, mult: 2 },
    { min: 10, mult: 1.5 },
    { min: 0, mult: 1 },
  ],
  holdTickSeconds: 0.1, // hold bonus: holdTickPoints per tick while the finger stays down
  holdTickPoints: 10,
  bonus: { double: 30, chord: 40, holdComplete: 50, chordHold: 50 },
};

function multiplierFor(combo) {
  for (const tier of JUDGE_CONFIG.comboTiers) if (combo >= tier.min) return tier.mult;
  return 1;
}

const holdTicks = (seconds) => Math.floor(seconds / JUDGE_CONFIG.holdTickSeconds + 1e-9);

/** Highest score a chart can give (every head Perfect, every bonus). Used for star thresholds. */
export function maxScore(field) {
  const { points, bonus, holdTickPoints } = JUDGE_CONFIG;
  let score = 0, combo = 0;
  for (const n of field.notes) {
    if (n.group && n.group.tiles[1] === n) continue; // chord handled once, via its first tile
    const tiles = n.group ? n.group.tiles : [n];
    score += points.perfect * multiplierFor(combo) * tiles.length;
    for (const t of tiles) {
      if (t.kind === Kind.HOLD) score += holdTicks(t.duration) * holdTickPoints + bonus.holdComplete;
      if (t.kind === Kind.DOUBLE) score += bonus.double;
    }
    if (n.group) score += bonus.chord + (n.kind === Kind.HOLD ? bonus.chordHold : 0);
    combo++;
  }
  return score;
}

export class Judge {
  constructor(field, difficulty, onEvent) {
    const s = DifficultyConfig[difficulty].windowScale;
    const w = JUDGE_CONFIG.windows;
    this.win = { perfect: w.perfect * s, great: w.great * s, good: w.good * s };
    this.field = field;
    this.onEvent = onEvent;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.basePoints = 0;
    this.holdsCompleted = 0;
    this.doublesLanded = 0;
    this.chordsHit = 0;
    this.penalty = DifficultyConfig[difficulty].penalty ?? null; // Hard only
    this.health = 100;
    this.failed = false;
  }

  get accuracy() {
    const total = this.field.notes.length;
    return total ? (this.basePoints / (total * JUDGE_CONFIG.points.perfect)) * 100 : 0;
  }

  // ---------- player actions ----------

  /** A finger went down in `lane` at song time t. Taps far from any note are wrong taps (a penalty on Hard, otherwise ignored). */
  tap(lane, t) {
    this.update(t);
    const note = firstActive(this.field, lane);
    if (!note) { this.hurt("wrong", { lane }); return; }

    if (note.state === NoteState.WAIT_SECOND) { // second tap of a double-tap
      if (t - note.firstT <= DOUBLE_WINDOW) this.finishDouble(note, true, t);
      return;
    }
    if (note.state !== NoteState.PENDING) return; // lane is busy with a hold
    const dt = Math.abs(t - note.time);
    if (dt > this.win.good) { this.hurt("wrong", { lane }); return; }
    const grade = dt <= this.win.perfect ? "perfect" : dt <= this.win.great ? "great" : "good";

    if (note.kind === Kind.DOUBLE) {
      note.state = NoteState.WAIT_SECOND;
      note.firstT = t;
      note.firstGrade = grade;
      this.onEvent("tick", note, grade, 0);
    } else {
      this.resolveHead(note, grade, t, false);
    }
  }

  /** The last finger left `lane` (lift, slide out, or cancel). */
  release(lane, t) {
    this.update(t);
    const note = firstActive(this.field, lane);
    if (!note || note.state !== NoteState.HELD) return;
    if (t >= note.end - this.win.good) this.completeHold(note);
    else this.breakHold(note);
  }

  /** Release every held note at once (used when the game pauses and finger tracking is lost). */
  releaseAll(t) {
    for (let lane = 0; lane < LANE_COUNT; lane++) this.release(lane, t);
  }

  // ---------- per-frame ----------

  /** Misses for notes that passed the line, double-tap timeouts, hold bonus ticks and auto-complete. */
  update(t) {
    const good = this.win.good;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      let note;
      while ((note = firstActive(this.field, lane))) {
        if (note.state === NoteState.PENDING) {
          if (t - note.time <= good) break;
          this.resolveHead(note, "miss", t, false);
        } else if (note.state === NoteState.WAIT_SECOND) {
          if (t - note.firstT <= DOUBLE_WINDOW) break;
          this.finishDouble(note, false, t);
        } else { // HELD
          const ticks = holdTicks(Math.min(t, note.end) - note.time);
          if (ticks > note.ticks) {
            this.score += (ticks - note.ticks) * JUDGE_CONFIG.holdTickPoints;
            note.ticks = ticks;
          }
          if (t <= note.end + good) break;
          this.completeHold(note); // held past the tail: finish it gently
        }
      }
    }
  }

  // ---------- internals ----------

  /** Score a tile's head tap (or miss) and update combo / chord bookkeeping. */
  resolveHead(note, grade, t, breakCombo) {
    const base = JUDGE_CONFIG.points[grade];
    const group = note.group;
    let mult;
    if (group) {
      if (!group.mult) group.mult = multiplierFor(this.combo);
      mult = group.mult;
    } else {
      mult = multiplierFor(this.combo);
    }
    note.grade = grade;
    note.hitT = t;
    this.counts[grade]++;
    this.basePoints += base;
    this.score += Math.round(base * mult);

    if (grade === "miss") {
      note.state = NoteState.MISSED;
      if (!group) this.combo = 0;
    } else {
      note.state = note.kind === Kind.HOLD ? NoteState.HELD : NoteState.HIT;
      if (!group) { if (breakCombo) this.combo = 0; else this.bumpCombo(); }
    }
    if (grade === "miss") this.hurt("miss", note);
    else if (this.penalty) this.health = Math.min(100, this.health + this.penalty.heal);
    this.onEvent("grade", note, grade, base);

    if (group) {
      group.heads++;
      if (grade === "miss") group.anyMiss = true;
      if (group.heads === 2) this.finishChordHeads(group);
    }
  }

  /** Hard: a miss or wrong tap costs score and health; at 0 health the song is failed. */
  hurt(kind, note) {
    const p = this.penalty;
    if (!p || this.failed) return;
    this.score = Math.max(0, this.score - (kind === "miss" ? p.scoreMiss : p.scoreWrong));
    this.health = Math.max(0, this.health - (kind === "miss" ? p.miss : p.wrong));
    if (this.health === 0) this.failed = true;
    this.onEvent("hurt", note, kind, 0);
  }

  finishChordHeads(group) {
    if (group.anyMiss) { this.combo = 0; return; } // one note = one combo break
    this.bumpCombo();
    this.chordsHit++;
    const [a, b] = group.tiles;
    if (Math.abs(a.hitT - b.hitT) <= CHORD_WINDOW) this.award("chord", a, JUDGE_CONFIG.bonus.chord);
  }

  finishDouble(note, landed, t) {
    if (landed) {
      this.resolveHead(note, note.firstGrade, note.firstT, false);
      this.doublesLanded++;
      this.award("double", note, JUDGE_CONFIG.bonus.double);
    } else {
      this.resolveHead(note, "good", note.firstT, true); // second tap missed: Good at best, combo breaks
    }
  }

  completeHold(note) {
    note.state = NoteState.HIT;
    this.holdsCompleted++;
    this.award("holdComplete", note, JUDGE_CONFIG.bonus.holdComplete);
    const group = note.group;
    if (group && ++group.holdsDone === 2 && !group.bonusGiven) {
      group.bonusGiven = true;
      this.award("chordHold", note, JUDGE_CONFIG.bonus.chordHold);
    }
  }

  breakHold(note) {
    note.state = NoteState.BROKEN;
    this.combo = 0;
    this.onEvent("break", note, "break", 0);
  }

  award(key, note, points) {
    this.score += points;
    this.onEvent("bonus", note, key, points);
  }

  bumpCombo() {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }
}
