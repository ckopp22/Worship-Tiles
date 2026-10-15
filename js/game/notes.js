// Note data: turns a chart (MDD 6.4) into playable tiles, with per-lane queues for fast lookup.
// Chart types: tap, hold, doubleTap, chord (two lanes; a duration makes it a hold chord).
// Each chord becomes two tiles that share a `group`, so every tile is judged on its own.

export const LANE_COUNT = 4;

export const NoteState = {
  PENDING: 0,     // waiting for its head tap
  HIT: 1,         // finished (hit / completed)
  MISSED: 2,      // head missed
  HELD: 3,        // hold head landed, finger should stay down
  WAIT_SECOND: 4, // double-tap: first tap landed, waiting for the second
  BROKEN: 5,      // hold released early
};

export const Kind = { TAP: "tap", HOLD: "hold", DOUBLE: "double" };

export const DOUBLE_WINDOW = 0.25; // seconds allowed between the two taps of a double-tap
export const CHORD_WINDOW = 0.08;  // both chord heads within this earns the Chord bonus

const isLane = (l) => Number.isInteger(l) && l >= 0 && l < LANE_COUNT;

function makeTile(raw, lane, kind, group) {
  const duration = kind === Kind.HOLD ? raw.duration : 0;
  return {
    time: raw.time, lane, type: raw.type, kind, duration, end: raw.time + duration,
    state: NoteState.PENDING, grade: null, group,
    hitT: 0,           // song time of the head tap
    firstT: 0,         // double-tap: time of the first tap
    firstGrade: null,  // double-tap: grade of the first tap
    ticks: 0,          // hold: bonus ticks already awarded
  };
}

/** Build the note field from chart JSON. Invalid entries are skipped. */
export function createField(chart) {
  const notes = [];
  for (const raw of chart.notes) {
    const hold = raw.duration > 0;
    if (raw.type === "chord") {
      const [a, b] = raw.lanes ?? [];
      if (!isLane(a) || !isLane(b) || a === b) continue;
      const group = { tiles: [], heads: 0, anyMiss: false, mult: 0, holdsDone: 0, bonusGiven: false };
      const kind = hold ? Kind.HOLD : Kind.TAP;
      group.tiles.push(makeTile(raw, a, kind, group), makeTile(raw, b, kind, group));
      notes.push(...group.tiles);
    } else if (raw.type === "tap" || raw.type === "doubleTap" || (raw.type === "hold" && hold)) {
      if (!isLane(raw.lane)) continue;
      const kind = raw.type === "hold" ? Kind.HOLD : raw.type === "doubleTap" ? Kind.DOUBLE : Kind.TAP;
      notes.push(makeTile(raw, raw.lane, kind, null));
    }
  }
  notes.sort((a, b) => a.time - b.time);

  const laneNotes = Array.from({ length: LANE_COUNT }, () => []);
  for (const n of notes) laneNotes[n.lane].push(n);
  return { notes, laneNotes, laneCursor: new Array(LANE_COUNT).fill(0) };
}

const isActive = (s) => s === NoteState.PENDING || s === NoteState.WAIT_SECOND || s === NoteState.HELD;

/** Earliest unfinished tile in a lane (waiting, mid double-tap, or being held), or null. */
export function firstActive(field, lane) {
  const list = field.laneNotes[lane];
  let i = field.laneCursor[lane];
  while (i < list.length && !isActive(list[i].state)) i++;
  field.laneCursor[lane] = i;
  return i < list.length ? list[i] : null;
}
