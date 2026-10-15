// Song loader: the only place the game gets songs from.
// The catalog lives in songs/songs.json (MDD 6.3). loadSong(id, difficulty) resolves to
// { id, title, credit, bpm, buffer, chart }, so game code never cares where a song came from.
//
// PLACEHOLDERS: entries with "builtin": "test-melody" reuse the synthesized test track and its charts.
// To add a real hymn, give its entry "audio" and a "charts" object (easy / normal / hard file paths)
// instead of "builtin". Remove "placeholder": true from entries you replace.
// Set "hidePlaceholders": true at the top of songs.json to hide every placeholder entry (for shipping).

import { state } from "./state.js";
import { getContext } from "./audio.js";
import { TEST_SONG_ID, TEST_BPM, buildTestSong } from "./testsong.js";

let catalogPromise = null;
const audioCache = new Map(); // audio key -> { buffer, charts? }

/** All catalog entries (cached after the first successful fetch). */
export function getCatalog() {
  catalogPromise ??= fetch("songs/songs.json")
    .then((res) => (res.ok ? res.json() : { songs: [] }))
    .then((json) => (json.songs ?? []).filter((s) => !(json.hidePlaceholders && s.placeholder)))
    .catch(() => { catalogPromise = null; return []; });
  return catalogPromise;
}

export const listSongs = getCatalog;

/** Free songs (price 0) are starters; everything else must be in ownedSongIds. */
export const isOwned = (song) => song.price === 0 || state.profile.ownedSongIds.includes(song.id);

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function loadAudio(entry) {
  const key = entry.builtin ?? entry.id;
  if (audioCache.has(key)) return audioCache.get(key);
  let audio;
  if (entry.builtin === TEST_SONG_ID) {
    audio = await buildTestSong(); // { buffer, charts }
  } else if (entry.builtin) {
    throw new Error(`Unknown built-in track: ${entry.builtin}`);
  } else {
    const data = await (await fetchOk(entry.audio)).arrayBuffer();
    const ctx = getContext() ?? new OfflineAudioContext(2, 1, 44100); // decode works on either
    audio = { buffer: await ctx.decodeAudioData(data) };
  }
  audioCache.set(key, audio);
  return audio;
}

async function loadReal(entry, difficulty) {
  const { buffer, charts } = await loadAudio(entry);
  const chart = charts ? charts[difficulty] : await (await fetchOk(entry.charts[difficulty])).json();
  if (!chart?.notes) throw new Error(`Bad chart for ${entry.id} (${difficulty})`);
  return { id: entry.id, title: entry.title, credit: entry.credit, bpm: entry.bpm, buffer, chart };
}

/** Load a song for a difficulty. If its audio or chart can't be loaded, play the built-in test track instead. */
export async function loadSong(id, difficulty = "easy") {
  const entry = (await getCatalog()).find((s) => s.id === id);
  if (!entry) throw new Error(`Unknown song: ${id}`);
  try {
    return await loadReal(entry, difficulty);
  } catch (err) {
    if (entry.builtin) throw err;
    console.warn(`Could not load "${id}" (${err.message}); using the built-in test track instead.`);
    const fallback = { ...entry, builtin: TEST_SONG_ID, bpm: TEST_BPM };
    return loadReal(fallback, difficulty);
  }
}
