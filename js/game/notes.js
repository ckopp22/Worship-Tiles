// Note data: turns a chart (MDD 6.4) into playable notes, with per-lane queues for fast lookup.
// Each note already carries type, duration and lanes so hold / doubleTap / chord can be added in 3b.

export const LANE_COUNT = 4;

export const NoteState = { PENDING: 0, HIT: 1, MISSED: 2 };

// Phase 3b: add "hold", "doubleTap", "chord" here once the judge can handle them.
const PLAYABLE_TYPES = new Set(["tap"]);

/** Build the note field from chart JSON. Unplayable types are skipped for now. */
export function createField(chart) {
  const notes = [];
  for (const raw of chart.notes) {
    if (!PLAYABLE_TYPES.has(raw.type)) continue;
    const lanes = raw.lanes ?? [raw.lane]; // chords use `lanes` (two lanes); single notes use `lane`
    if (lanes.some((l) => !Number.isInteger(l) || l < 0 || l >= LANE_COUNT)) continue;
    notes.push({
      time: raw.time,
      lane: lanes[0],
      lanes,
      type: raw.type,
      duration: raw.duration ?? 0,
      state: NoteState.PENDING,
      grade: null,
    });
  }
  notes.sort((a, b) => a.time - b.time);

  const laneNotes = Array.from({ length: LANE_COUNT }, () => []);
  for (const n of notes) laneNotes[n.lane].push(n);
  return { notes, laneNotes, laneCursor: new Array(LANE_COUNT).fill(0) };
}

/** Earliest unresolved note in a lane, or null. */
export function firstPending(field, lane) {
  const list = field.laneNotes[lane];
  let i = field.laneCursor[lane];
  while (i < list.length && list[i].state !== NoteState.PENDING) i++;
  field.laneCursor[lane] = i;
  return i < list.length ? list[i] : null;
}
