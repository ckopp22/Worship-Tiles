// Built-in test track: a short synthesized hymn-like melody plus Easy / Normal / Hard charts.
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

// [startBeat, lane | [laneA, laneB], type, holdLengthInBeats?]. Chords use two lanes; a length makes them hold chords.
const CHART_ROWS = {
  easy: [
    [4,1,"tap"], [6,3,"tap"], [8,1,"tap"], [10,0,"hold",1.7], [12,0,"tap"], [14,2,"tap"],
    [16,0,"tap"], [18,[1,2],"chord"], [20,2,"tap"], [22,3,"tap"], [24,2,"tap"], [26,2,"hold",1.7],
    [28,3,"tap"], [30,1,"tap"], [32,0,"hold",3.6], [36,1,"tap"], [38,[2,3],"chord"], [40,1,"tap"],
    [42,0,"hold",1.7], [44,0,"tap"], [46,2,"tap"], [48,0,"tap"], [50,[1,2],"chord"], [52,3,"tap"],
    [54,2,"tap"], [56,2,"hold",1.7], [58,1,"tap"], [60,0,"hold",3.6],
  ],
  normal: [
    [4,1,"tap"], [5,2,"tap"], [6,3,"tap"], [7,2,"tap"], [8,[1,2],"chord"], [9,0,"tap"],
    [10,0,"hold",1.7], [12,0,"tap"], [13,1,"tap"], [14,2,"tap"], [15,1,"tap"], [16,0,"tap"],
    [18,1,"doubleTap"], [20,[0,2],"chord"], [21,3,"tap"], [22,3,"tap"], [23,3,"tap"], [24,[2,3],"chord"],
    [25,1,"tap"], [26,2,"doubleTap"], [28,3,"tap"], [29,2,"tap"], [30,1,"tap"], [31,0,"tap"],
    [32,[0,2],"chord",3.6], [36,[1,3],"chord"], [37,2,"tap"], [38,3,"tap"], [39,2,"tap"], [40,1,"tap"],
    [41,0,"tap"], [42,0,"hold",1.7], [44,0,"tap"], [45,1,"tap"], [46,2,"tap"], [47,1,"tap"],
    [48,0,"hold",1.7], [50,2,"doubleTap"], [52,3,"tap"], [53,3,"tap"], [54,2,"tap"], [55,1,"tap"],
    [56,2,"hold",1.7], [58,1,"doubleTap"], [59,0,"tap"], [60,[0,2],"chord",3.6],
  ],
  hard: [
    [4,1,"tap"], [4.5,3,"tap"], [5,2,"tap"], [5.5,0,"tap"], [6,3,"tap"], [6.5,1,"tap"],
    [7,2,"tap"], [7.5,0,"tap"], [8,[0,3],"chord"], [8.5,3,"tap"], [9,0,"tap"], [9.5,2,"tap"],
    [10,0,"hold",1.7], [12,0,"tap"], [12.5,2,"tap"], [13,1,"tap"], [13.5,3,"tap"], [14,2,"tap"],
    [14.5,0,"tap"], [15,1,"tap"], [15.5,3,"tap"], [16,0,"hold",1.7], [18,1,"doubleTap"], [20,2,"tap"],
    [20.5,0,"tap"], [21,3,"tap"], [21.5,1,"tap"], [22,3,"doubleTap"], [22.5,1,"tap"], [23,3,"tap"],
    [23.5,1,"tap"], [24,[1,3],"chord"], [24.5,0,"tap"], [25,1,"tap"], [25.5,3,"tap"], [26,2,"hold",1.7],
    [28,3,"tap"], [28.5,1,"tap"], [29,2,"tap"], [29.5,0,"tap"], [30,1,"tap"], [30.5,3,"tap"],
    [31,0,"tap"], [31.5,2,"tap"], [32,0,"hold",3.7], [33,2,"tap"], [33.5,3,"tap"], [34,[1,3],"chord"],
    [35,2,"tap"], [36,[0,2],"chord"], [36.5,3,"tap"], [37,2,"tap"], [37.5,0,"tap"], [38,3,"tap"],
    [38.5,1,"tap"], [39,2,"tap"], [39.5,0,"tap"], [40,[1,3],"chord"], [40.5,3,"tap"], [41,0,"tap"],
    [41.5,2,"tap"], [42,0,"hold",1.7], [44,0,"tap"], [44.5,2,"tap"], [45,1,"tap"], [45.5,3,"tap"],
    [46,2,"doubleTap"], [46.5,0,"tap"], [47,1,"tap"], [47.5,3,"tap"], [48,0,"tap"], [50,[0,2],"chord",1.7],
    [52,[0,3],"chord"], [52.5,1,"tap"], [53,3,"tap"], [53.5,1,"tap"], [54,2,"tap"], [54.5,0,"tap"],
    [55,1,"tap"], [55.5,3,"tap"], [56,2,"hold",1.7], [58,1,"doubleTap"], [58.5,3,"tap"], [59,0,"tap"],
    [59.5,2,"tap"], [60,[0,3],"chord",3.7],
  ],
};

/** Chart in the section 6.4 format, built from CHART_ROWS (beats converted to seconds). */
function toChart(difficulty) {
  return {
    songId: TEST_SONG_META.id,
    difficulty,
    notes: CHART_ROWS[difficulty].map(([beat, lane, type, lengthBeats]) => {
      const note = { time: Math.round(beat * SPB * 1000) / 1000, type };
      if (Array.isArray(lane)) note.lanes = lane; else note.lane = lane;
      if (lengthBeats) note.duration = Math.round(lengthBeats * SPB * 1000) / 1000;
      return note;
    }),
  };
}

export const TEST_CHARTS = { easy: toChart("easy"), normal: toChart("normal"), hard: toChart("hard") };

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
  return { buffer, charts: TEST_CHARTS };
}
