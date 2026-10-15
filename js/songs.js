// Song loader: the only place the game gets songs from.
// loadSong(id) resolves to { id, title, credit, bpm, buffer, chart }. Real mp3 + chart JSON entries
// in songs/songs.json (MDD 6.3) load through the same function, so game code never changes.

import { getContext } from "./audio.js";
import { TEST_SONG_META, buildTestSong } from "./testsong.js";

const cache = new Map();

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

export async function loadSong(id, difficulty = "easy") {
  const key = `${id}:${difficulty}`;
  if (cache.has(key)) return cache.get(key);

  let song;
  if (id === TEST_SONG_META.id) {
    song = { ...TEST_SONG_META, ...(await buildTestSong()) };
  } else {
    const entry = (await fetchCatalog()).find((s) => s.id === id);
    if (!entry) throw new Error(`Unknown song: ${id}`);
    const [audioData, chart] = await Promise.all([
      fetch(entry.audio).then((r) => r.arrayBuffer()),
      fetch(entry.charts[difficulty]).then((r) => r.json()),
    ]);
    const ctx = getContext() ?? new OfflineAudioContext(2, 1, 44100); // decode works on either
    const buffer = await ctx.decodeAudioData(audioData);
    song = { id: entry.id, title: entry.title, credit: entry.credit, bpm: entry.bpm, buffer, chart };
  }
  cache.set(key, song);
  return song;
}
