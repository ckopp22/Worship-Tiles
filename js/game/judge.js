// Hit rules and scoring (Piano Tiles style): any visible tile can be tapped, lowest first, until it
// leaves the screen. Every tile is worth 1 point, plus 1 for holding a long tile to its end.
// Judge reports what happened through onEvent(type, note, key):
//   "hit", "miss", "bonus" (hold completed), "break" (hold released early), "hurt" (Hard penalty).
// Accuracy % = tiles hit / tiles.

import { LANE_COUNT, Kind, NoteState, firstActive } from "./notes.js";
import { DifficultyConfig } from "./difficulty.js";

const SAME_ROW = 0.02;      // seconds: tiles this close together can be tapped in either order
const RELEASE_GRACE = 0.15; // seconds before the tail that a hold may be let go

/** Highest score a chart can give. Used for star thresholds. */
export const maxScore = (field) => field.notes.reduce((sum, n) => sum + (n.kind === Kind.HOLD ? 2 : 1), 0);

export class Judge {
  /** visible() returns { early, late }: seconds before / after its note time that a tile is on screen. */
  constructor(field, difficulty, visible, onEvent) {
    this.visible = visible;
    this.field = field;
    this.onEvent = onEvent;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { hit: 0, miss: 0 };
    this.holdsCompleted = 0;
    this.chordsHit = 0;
    this.penalty = DifficultyConfig[difficulty].penalty ?? null; // Hard only
    this.health = 100;
    this.failed = false;
  }

  get accuracy() {
    const total = this.field.notes.length;
    return total ? (this.counts.hit / total) * 100 : 0;
  }

  // ---------- player actions ----------

  /** A finger went down in `lane` at song time t. Anything but the lowest visible tile is a wrong tap (a penalty on Hard, otherwise ignored). */
  tap(lane, t) {
    this.update(t);
    const note = firstActive(this.field, lane);
    if (note && note.state !== NoteState.PENDING) return; // lane is busy with a hold
    if (!note || note.time - t > this.visible().early || note.time > this.nextTime() + SAME_ROW) {
      this.hurt("wrong", { lane });
      return;
    }
    note.state = note.kind === Kind.HOLD ? NoteState.HELD : NoteState.HIT;
    note.hitT = t;
    this.counts.hit++;
    this.score++;
    if (this.penalty) this.health = Math.min(100, this.health + this.penalty.heal);
    if (++this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (note.group && ++note.group.hits === 2) this.chordsHit++;
    this.onEvent("hit", note);
  }

  /** The last finger left `lane` (lift, slide out, or cancel). */
  release(lane, t) {
    this.update(t);
    const note = firstActive(this.field, lane);
    if (!note || note.state !== NoteState.HELD) return;
    if (t >= note.end - RELEASE_GRACE) this.completeHold(note);
    else this.breakHold(note);
  }

  /** Release every held note at once (used when the game pauses and finger tracking is lost). */
  releaseAll(t) {
    for (let lane = 0; lane < LANE_COUNT; lane++) this.release(lane, t);
  }

  // ---------- per-frame ----------

  /** Misses for tiles that left the screen, and auto-complete for holds. */
  update(t) {
    const { late } = this.visible();
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      let note;
      while ((note = firstActive(this.field, lane))) {
        if (note.state === NoteState.PENDING) {
          if (t - note.time <= late) break;
          this.miss(note, t);
        } else { // HELD
          if (t < note.end) break;
          this.completeHold(note);
        }
      }
    }
  }

  // ---------- internals ----------

  /** Time of the earliest tile still waiting to be tapped. */
  nextTime() {
    let next = Infinity;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const note = firstActive(this.field, lane);
      if (note && note.state === NoteState.PENDING) next = Math.min(next, note.time);
    }
    return next;
  }

  miss(note, t) {
    note.state = NoteState.MISSED;
    note.hitT = t;
    this.counts.miss++;
    this.combo = 0;
    this.hurt("miss", note);
    this.onEvent("miss", note);
  }

  /** Hard: a miss or wrong tap costs score and health; at 0 health the song is failed. */
  hurt(kind, note) {
    const p = this.penalty;
    if (!p || this.failed) return;
    this.score = Math.max(0, this.score - (kind === "miss" ? p.scoreMiss : p.scoreWrong));
    this.health = Math.max(0, this.health - (kind === "miss" ? p.miss : p.wrong));
    if (this.health === 0) this.failed = true;
    this.onEvent("hurt", note, kind);
  }

  completeHold(note) {
    note.state = NoteState.HIT;
    this.holdsCompleted++;
    this.score++;
    this.onEvent("bonus", note, "holdComplete");
  }

  breakHold(note) {
    note.state = NoteState.BROKEN;
    this.combo = 0;
    this.onEvent("break", note);
  }
}
