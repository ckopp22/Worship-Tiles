// Settings + player profile, saved to localStorage under one versioned key (MDD section 8).

const STORAGE_KEY = "worshipTiles.save.v1";
const VERSION = 1;

const DEFAULTS = {
  settings: { soundEnabled: true, hapticsEnabled: true, latencyOffsetMs: 0, musicVolume: 0.8, sfxVolume: 0.7 },
  profile: {
    bank: 0,
    ownedSongIds: [], // starter songs are granted once the catalog exists (Phase 4)
    highScores: {},   // { songId: { easy: { score, stars, accuracy } } }
    lastDifficulty: {}, // { songId: "easy" | "normal" | "hard" }
    hasSeenTutorial: false,
  },
};

// Added after the first release: older saves and exports may lack them, so they are optional on import.
const OPTIONAL_KEYS = new Set(["musicVolume", "sfxVolume"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

const matchesType = (def, value) =>
  Array.isArray(def) ? Array.isArray(value)
  : isObject(def) ? isObject(value)
  : typeof value === typeof def && (typeof value !== "number" || Number.isFinite(value));

/** Merge saved data over defaults, keeping only values of the expected type. */
function sanitize(raw) {
  const out = clone(DEFAULTS);
  if (!isObject(raw)) return out;

  for (const section of ["settings", "profile"]) {
    if (!isObject(raw[section])) continue;
    for (const key of Object.keys(out[section])) {
      if (matchesType(out[section][key], raw[section][key])) out[section][key] = raw[section][key];
    }
  }
  const s = out.settings, p = out.profile;
  s.latencyOffsetMs = Math.max(-200, Math.min(200, Math.round(s.latencyOffsetMs)));
  s.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
  s.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
  p.bank = Math.max(0, Math.floor(p.bank));
  p.ownedSongIds = p.ownedSongIds.filter((id) => typeof id === "string");
  return out;
}

function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return sanitize(null); // storage blocked or JSON corrupt
  }
}

export const state = load();

const listeners = new Set();

/** Call fn(state) after every change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  save();
  listeners.forEach((fn) => fn(state));
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, settings: state.settings, profile: state.profile }));
  } catch {
    // storage unavailable (private mode / quota): keep playing in memory
  }
}

function set(section, key, value) {
  state[section][key] = value;
  commit();
}

export const setSetting = (key, value) => set("settings", key, value);
export const setProfile = (key, value) => set("profile", key, value);

/** Remember the last-used difficulty for a song. */
export function setLastDifficulty(songId, difficulty) {
  setProfile("lastDifficulty", { ...state.profile.lastDifficulty, [songId]: difficulty });
}

/** Keep the best score, stars and accuracy per song per difficulty. Returns true if the score beat the old best. */
export function recordResult(songId, difficulty, { score, stars, accuracy }) {
  const all = state.profile.highScores;
  const prev = all[songId]?.[difficulty] ?? {};
  const best = {
    score: Math.max(prev.score ?? 0, score),
    stars: Math.max(prev.stars ?? 0, stars),
    accuracy: Math.max(prev.accuracy ?? 0, accuracy),
  };
  setProfile("highScores", { ...all, [songId]: { ...all[songId], [difficulty]: best } });
  return score > (prev.score ?? 0);
}

/** Add coins to the Bank. */
export function addToBank(amount) {
  setProfile("bank", state.profile.bank + Math.max(0, Math.floor(amount)));
}

/** Spend `price` coins and own the song. Returns false if already owned or unaffordable. */
export function purchaseSong(songId, price) {
  const p = state.profile;
  if (p.ownedSongIds.includes(songId) || p.bank < price) return false;
  p.bank -= price;
  p.ownedSongIds = [...p.ownedSongIds, songId];
  commit();
  return true;
}

// ---- Backup (MDD 4.8) ----

/** The save as pretty JSON text, for the Export Save download. */
export function exportSave() {
  return JSON.stringify({ version: VERSION, settings: state.settings, profile: state.profile }, null, 2);
}

/** Parse and validate imported text. Returns { error } or { save } (a cleaned save ready for replaceState). */
export function parseSave(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { error: "That file isn't valid JSON." }; }
  if (!isObject(raw) || !isObject(raw.settings) || !isObject(raw.profile)) return { error: "That isn't a Worship Tiles save file." };
  if (raw.version !== VERSION) return { error: `Unsupported save version (${raw.version}).` };
  for (const section of ["settings", "profile"]) {
    for (const [key, def] of Object.entries(DEFAULTS[section])) {
      if (OPTIONAL_KEYS.has(key) && raw[section][key] === undefined) continue;
      if (!matchesType(def, raw[section][key])) return { error: `The save is missing or has a bad value for ${section}.${key}.` };
    }
  }
  return { save: sanitize(raw) };
}

/** Replace all progress with a cleaned save (import) or null (reset to defaults). */
export function replaceState(cleanSave) {
  const next = cleanSave ?? sanitize(null);
  state.settings = next.settings;
  state.profile = next.profile;
  commit();
}
