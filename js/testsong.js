// Built-in test track: a short synthesized hymn-like melody plus its chart.
// Rendered into an AudioBuffer with OfflineAudioContext so it plays exactly like a decoded mp3.

const SR = 44100;
const BPM = 72;
const SPB = 60 / BPM;      // seconds per beat
const BEATS = 64;          // 16 bars of 4/4 (about 53 s)
const TAIL = 3;            // seconds of ring-out after the last note

export const TEST_SONG_META = {
  id: "test-melody",
  title: "Test Melody",
  credit: "Built-in synthesized test track",
  bpm: BPM,
};

// [startBeat, durationBeats, midiNote]. Bar 1 is a pad-only intro.
const MELODY = [
  [4, 1, 64], [5, 1, 67], [6, 1, 69], [7, 1, 67],
  [8, 1, 64], [9, 1, 62], [10, 2, 60],
  [12, 1, 62], [13, 1, 64], [14, 1, 67], [15, 1, 64],
  [16, 2, 62], [18, 2, 64],
  [20, 1, 67], [21, 1, 69], [22, 1, 72], [23, 1, 69],
  [24, 1, 67], [25, 1, 64], [26, 2, 67],
  [28, 1, 69], [29, 1, 67], [30, 1, 64], [31, 1, 62],
  [32, 4, 60],
  [36, 1, 64], [37, 1, 67], [38, 1, 69], [39, 1, 67],
  [40, 1, 64], [41, 1, 62], [42, 2, 60],
  [44, 1, 62], [45, 1, 64], [46, 1, 67], [47, 1, 64],
  [48, 2, 62], [50, 2, 67],
  [52, 1, 69], [53, 1, 69], [54, 1, 67], [55, 1, 64],
  [56, 2, 67], [58, 1, 64], [59, 1, 62],
  [60, 4, 60],
];

// One triad (octave 3) per bar.
const C = [48, 52, 55], G = [43, 47, 50], F = [41, 45, 48], Am = [45, 48, 52];
const PADS = [C, C, C, G, G, F, C, Am, C, C, C, G, G, F, C, C];

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Pitch to lane: low notes left, high notes right.
function laneFor(midi) {
  if (midi <= 62) return 0;
  if (midi <= 65) return 1;
  if (midi <= 67) return 2;
  return 3;
}

/** Chart in the section 6.4 format. Note times come straight from the melody table. */
export const TEST_CHART = {
  songId: TEST_SONG_META.id,
  difficulty: "easy",
  notes: MELODY.map(([beat, , midi]) => ({
    time: Math.round(beat * SPB * 1000) / 1000,
    lane: laneFor(midi),
    type: "tap",
  })),
};

function voice(ctx, out, type, hz, start, dur, peak, attack, release) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + dur);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + release + 0.05);
}

/** Render the melody and pads into an AudioBuffer. */
export async function buildTestSong() {
  const length = Math.ceil((BEATS * SPB + TAIL) * SR);
  const ctx = new OfflineAudioContext(2, length, SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);

  PADS.forEach((chord, bar) => {
    chord.forEach((m) => voice(ctx, out, "sine", midiToHz(m), bar * 4 * SPB, 4 * SPB, 0.05, 0.4, 0.8));
  });
  MELODY.forEach(([beat, beats, midi]) => {
    const hz = midiToHz(midi), t = beat * SPB, d = beats * SPB * 0.92;
    voice(ctx, out, "sine", hz, t, d, 0.28, 0.015, 0.35);
    voice(ctx, out, "triangle", hz * 2, t, d, 0.07, 0.015, 0.25);
  });

  const buffer = await ctx.startRendering();
  return { buffer, chart: TEST_CHART };
}
