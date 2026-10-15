// Settings + player profile, saved to localStorage under one versioned key (MDD section 8).

const STORAGE_KEY = "worshipTiles.save.v1";
const VERSION = 1;

const DEFAULTS = {
  settings: { soundEnabled: true, hapticsEnabled: true, latencyOffsetMs: 0 },
  profile: {
    bank: 0,
    ownedSongIds: [], // starter songs are granted once the catalog exists (Phase 4)
    highScores: {},   // { songId: { easy: { score, stars, accuracy } } }
    lastDifficulty: {}, // { songId: "easy" | "normal" | "hard" }
    hasSeenTutorial: false,
  },
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Merge saved data over defaults, keeping only values of the expected type. */
function sanitize(raw) {
  const out = clone(DEFAULTS);
  if (!isObject(raw)) return out;

  for (const section of ["settings", "profile"]) {
    if (!isObject(raw[section])) continue;
    for (const key of Object.keys(out[section])) {
      const value = raw[section][key];
      const def = out[section][key];
      const ok = Array.isArray(def) ? Array.isArray(value)
        : isObject(def) ? isObject(value)
        : typeof value === typeof def && (typeof value !== "number" || Number.isFinite(value));
      if (ok) out[section][key] = value;
    }
  }
  const s = out.settings, p = out.profile;
  s.latencyOffsetMs = Math.max(-200, Math.min(200, Math.round(s.latencyOffsetMs)));
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

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, settings: state.settings, profile: state.profile }));
  } catch {
    // storage unavailable (private mode / quota): keep playing in memory
  }
}

function set(section, key, value) {
  state[section][key] = value;
  save();
  listeners.forEach((fn) => fn(state));
}

export const setSetting = (key, value) => set("settings", key, value);
export const setProfile = (key, value) => set("profile", key, value);

/** Remember the last-used difficulty for a song. */
export function setLastDifficulty(songId, difficulty) {
  setProfile("lastDifficulty", { ...state.profile.lastDifficulty, [songId]: difficulty });
}

/** Keep the best score, stars and accuracy per song per difficulty. */
export function recordResult(songId, difficulty, { score, stars, accuracy }) {
  const all = state.profile.highScores;
  const prev = all[songId]?.[difficulty] ?? {};
  const best = {
    score: Math.max(prev.score ?? 0, score),
    stars: Math.max(prev.stars ?? 0, stars),
    accuracy: Math.max(prev.accuracy ?? 0, accuracy),
  };
  setProfile("highScores", { ...all, [songId]: { ...all[songId], [difficulty]: best } });
}
