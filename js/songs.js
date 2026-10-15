// Song loader: the only place the game gets songs from.
// loadSong(id, difficulty) resolves to { id, title, credit, bpm, buffer, chart }. Real mp3 + chart JSON
// entries in songs/songs.json (MDD 6.3: one chart file per difficulty) load through the same function,
// so game code never changes.

import { getContext } from "./audio.js";
import { TEST_SONG_META, buildTestSong } from "./testsong.js";

const audioCache = new Map(); // id -> { meta, buffer, charts? }

async function fetchCatalog() {
  try {
    const res = await fetch("songs/songs.json");
    return res.ok ? (await res.json()).songs ?? [] : [];
  } catch {
    return [];
  }
}

/** Songs shown in the Library: the built-in test song plus anything in songs.json. */
export async function listSongs() {
  const catalog = await fetchCatalog();
  return [TEST_SONG_META, ...catalog.map(({ id, title, credit, bpm }) => ({ id, title, credit, bpm }))];
}

async function loadAudio(id) {
  if (audioCache.has(id)) return audioCache.get(id);
  let entry;
  if (id === TEST_SONG_META.id) {
    entry = { meta: TEST_SONG_META, ...(await buildTestSong()) }; // { buffer, charts }
  } else {
    const song = (await fetchCatalog()).find((s) => s.id === id);
    if (!song) throw new Error(`Unknown song: ${id}`);
    const data = await fetch(song.audio).then((r) => r.arrayBuffer());
    const ctx = getContext() ?? new OfflineAudioContext(2, 1, 44100); // decode works on either
    entry = { meta: song, buffer: await ctx.decodeAudioData(data), song };
  }
  audioCache.set(id, entry);
  return entry;
}

export async function loadSong(id, difficulty = "easy") {
  const { meta, buffer, charts, song } = await loadAudio(id);
  const chart = charts ? charts[difficulty] : await fetch(song.charts[difficulty]).then((r) => r.json());
  return { id: meta.id, title: meta.title, credit: meta.credit, bpm: meta.bpm, buffer, chart };
}
