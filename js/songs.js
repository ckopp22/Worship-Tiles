// Song loader: the only place the game gets songs from.
// The catalog lives in songs/songs.json (MDD 6.3). loadSong(id, difficulty) resolves to
// { id, title, credit, bpm, buffer, chart }, so game code never cares where a song came from.
//
// PLACEHOLDERS: entries with "builtin": "test-melody" reuse the synthesized test track and its charts.
// To add a real hymn, give its entry "audio" and a "charts" object (easy / normal / hard file paths)
// instead of "builtin". Remove "placeholder": true from entries you replace.

import { state } from "./state.js";
import { getContext } from "./audio.js";
import { TEST_SONG_ID, buildTestSong } from "./testsong.js";

let catalogPromise = null;
const audioCache = new Map(); // audio key -> { buffer, charts? }

/** All catalog entries (cached after the first successful fetch). */
export function getCatalog() {
  catalogPromise ??= fetch("songs/songs.json")
    .then((res) => (res.ok ? res.json() : { songs: [] }))
    .then((json) => json.songs ?? [])
    .catch(() => { catalogPromise = null; return []; });
  return catalogPromise;
}

export const listSongs = getCatalog;

/** Free songs (price 0) are starters; everything else must be in ownedSongIds. */
export const isOwned = (song) => song.price === 0 || state.profile.ownedSongIds.includes(song.id);

async function loadAudio(entry) {
  const key = entry.builtin ?? entry.id;
  if (audioCache.has(key)) return audioCache.get(key);
  let audio;
  if (entry.builtin === TEST_SONG_ID) {
    audio = await buildTestSong(); // { buffer, charts }
  } else if (entry.builtin) {
    throw new Error(`Unknown built-in track: ${entry.builtin}`);
  } else {
    const data = await fetch(entry.audio).then((r) => r.arrayBuffer());
    const ctx = getContext() ?? new OfflineAudioContext(2, 1, 44100); // decode works on either
    audio = { buffer: await ctx.decodeAudioData(data) };
  }
  audioCache.set(key, audio);
  return audio;
}

export async function loadSong(id, difficulty = "easy") {
  const entry = (await getCatalog()).find((s) => s.id === id);
  if (!entry) throw new Error(`Unknown song: ${id}`);
  const { buffer, charts } = await loadAudio(entry);
  const chart = charts ? charts[difficulty] : await fetch(entry.charts[difficulty]).then((r) => r.json());
  return { id: entry.id, title: entry.title, credit: entry.credit, bpm: entry.bpm, buffer, chart };
}
