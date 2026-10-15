# Worship Tiles

A reverent rhythm-tap game for the mobile web. Notes from classic public-domain hymns fall down four lanes; tap, hold, double-tap and play chords in time to the music. Score becomes coins ("the Bank"), and coins unlock more hymns.

Plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no dependencies, no analytics. It is an installable PWA that works offline, played in portrait on a phone.

The design document is in [docs/Worship-Tiles-Web-MDD2.md](docs/Worship-Tiles-Web-MDD2.md). Song licensing is logged in [docs/LICENSING.md](docs/LICENSING.md).

## Run it locally

Any static file server works. From the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Opening `index.html` directly will not work: ES modules need a server.)

- **Keyboard:** `D F J K` play lanes 1 to 4. Press two keys together for chords.
- **On your phone:** use your computer's LAN address, e.g. `http://192.168.1.20:8000`, on the same Wi-Fi.
- **Service worker on localhost:** it is off by default so you always see your latest edits. To test offline/PWA behaviour locally, open <http://localhost:8000/?sw=1>.
- **Dev coins:** add `?dev=1` to the URL, then tap the Bank balance 5 times for +1000 coins. Players never see this.

## Tools (optional, Node only)

| Command | What it does |
|---|---|
| `node tools/make_charts.mjs <song-id>` | Regenerates a song's three charts from `tools/data/<song-id>.notes.json` |
| `node tools/analyze_song.mjs <song-id>` | Builds that notes file from the song's audio when there is no MIDI (macOS only; the rhythm is accurate, the lanes are an estimate) |
| `node tools/trim_audio.mjs <in.mp3> <out.m4a>` | Trims a long song to about a minute with a fade-out (macOS only). Run `analyze_song` and `make_charts` after trimming |
| `node tools/validate_charts.mjs` | Checks every song's charts (sorted, lanes, overlaps, audio length) |
| `node tools/make_icons.mjs` | Regenerates the app icons in `icons/` |
| `node tools/check_precache.mjs` | Checks that `sw.js` precaches every file the app needs |

## Adding a song

1. Put the audio in `songs/audio/` (mp3 or m4a; trim long songs with `tools/trim_audio.mjs` to about a minute).
2. If you have MIDI-derived note timings, save them as `tools/data/<id>.notes.json`; otherwise run `node tools/analyze_song.mjs <id>`.
3. Run `node tools/make_charts.mjs <id>`, then `node tools/validate_charts.mjs`.
4. Add the song to `songs/songs.json` (id, title, credit, bpm, price, audio, charts) and a row to `docs/LICENSING.md`.
5. Release (below). Free songs (price 0) are also cached for offline use at install, so add their files to `PRECACHE` in `sw.js` and run `node tools/check_precache.mjs`.

## Releasing an update

The service worker serves files cache-first, so phones only pick up changes when the version changes.

1. Make your changes. If you added or removed a file the app needs, add or remove it in the `PRECACHE` list in `sw.js` and run `node tools/check_precache.mjs`.
2. Edit **`js/version.js`** and bump `WT_VERSION` (for example `"1.0.0"` to `"1.0.1"`). This is the only place the version lives.
3. Commit and push to `main`.
4. GitHub Pages redeploys in about a minute. Players who already installed the game see **"New version ready. Tap to update"** the next time they open it (never during a song). The version is shown at the bottom of Settings.

## Put it on GitHub Pages

The game must be served from a repository's Pages URL, e.g. `https://USERNAME.github.io/REPO/`. All paths in the app are relative, so the subfolder is fine.

1. Create a new **public** repository on GitHub (for example `Worship-Tiles`) with no README, .gitignore or license.
2. In this folder, connect and push:
   ```bash
   git remote add origin https://github.com/USERNAME/REPO.git   # skip if origin already exists
   git branch -M main
   git push -u origin main
   ```
3. On GitHub open **Settings > Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then **Save**.
4. Wait a minute or two, then open `https://USERNAME.github.io/REPO/`. (The page shows the live address at the top of Settings > Pages.)

`.nojekyll` in the project root tells GitHub Pages to serve the files as-is.

## Install on your phone

Open the Pages address in the phone's browser first.

- **iPhone (Safari):** tap the **Share** button, then **Add to Home Screen**, then **Add**. Open the game from the new icon. It must be Safari; other iPhone browsers can't install it.
- **Android (Chrome):** tap the **menu (three dots)**, then **Install app** (or **Add to Home screen**), then **Install**.

After the first visit the game works offline, including Amazing Grace. Other songs are saved for offline use the first time you play them.

## Before sharing widely

- Optional menu music: add an mp3 (for example `songs/audio/menu.mp3`) and set `"menuMusic": "songs/audio/menu.mp3"` at the top of `songs/songs.json`. It is cached for offline use the first time it plays.
- Replace the placeholder songs in `songs/songs.json` with real hymns (see the table in `docs/LICENSING.md`), or set `"hidePlaceholders": true` at the top of that file to hide them.
- Confirm the audio source for every song in `docs/LICENSING.md`.
- Your progress lives in the browser. Settings > Export Save makes a backup file.
