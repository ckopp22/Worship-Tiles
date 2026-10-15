# Worship Tiles — Design Document (Web App / PWA)

**Platform:** Mobile web app (installable PWA), portrait only
**Tech:** Plain HTML, CSS, and JavaScript. Canvas 2D for gameplay, Web Audio API for sound and timing, localStorage for saves. No frameworks, no build step.
**Build workflow:** Written with Claude Code in VS Code, tested in a browser and on a phone
**Hosting:** GitHub Pages (free), played from the phone's home screen
**Distribution:** Personal and shared by link. No App Store, no monetization.
**Version:** 0.2 (Web design draft)

---

## 1. Game Overview

### 1.1 Concept
Worship Tiles is a rhythm-tap game in which notes of classic hymns fall down four lanes. The player taps the correct lane when a note reaches the hit line to play the song. Better timing scores higher. Scores convert to in-game coins ("the Bank"), which unlock more hymns.

### 1.2 Pitch
A reverent, beautiful take on the tile-tapping rhythm game where you play through the great old hymns of the faith.

### 1.3 Audience
Personal use, family, and friends. Youth groups can play by opening a link. Content is clean and suitable for all ages.

### 1.4 Design Pillars
1. **Reverent but fun:** worshipful atmosphere without feeling stuffy.
2. **Instantly playable:** learn in under 30 seconds.
3. **Rewarding progression:** every song played brings the next hymn closer.
4. **No licensing risk:** every song is public domain.
5. **Simple to maintain:** one small codebase, no build tooling.

---

## 2. Technical Specification

| Item | Decision |
|---|---|
| Languages | HTML5, CSS3, vanilla JavaScript (ES modules) |
| Rendering | Canvas 2D for the gameplay screen; regular DOM/CSS for menus |
| Audio | Web Audio API (`AudioContext`) for song playback, SFX, and the timing clock |
| Input | Pointer Events (`pointerdown`, `pointerup`, `pointercancel`), tracked by `pointerId` for multi-touch |
| Persistence | `localStorage` (JSON), plus Export/Import backup |
| Offline | Service worker caches the app shell and song files; manifest makes it installable |
| Hosting | GitHub Pages |
| Target devices | Phones first (iPhone Safari and Android Chrome); works on desktop with mouse or keyboard as a bonus |
| Frame rate | `requestAnimationFrame`, targeting 60 FPS |
| Dependencies | None |

### 2.1 Portrait Only (Web Notes)
- The manifest sets `"orientation": "portrait"` (honored by Android; **iOS ignores it**).
- On iOS and everywhere else, the game detects landscape (`matchMedia("(orientation: landscape)")`) and shows a full-screen "Please rotate your phone to portrait" overlay that pauses gameplay.
- Layout is fixed to a portrait aspect ratio and scales to fit the screen, centered with letterboxing on wide displays (e.g. desktop).

### 2.2 Mobile Web Requirements
- Viewport meta with `viewport-fit=cover`; use `env(safe-area-inset-*)` for notch and home-indicator spacing.
- Disable scrolling, pull-to-refresh, double-tap zoom, text selection, and the long-press callout: `touch-action: none`, `user-select: none`, `overscroll-behavior: none`, `-webkit-touch-callout: none`.
- **Audio unlock:** browsers (especially iOS Safari) require a user tap before audio plays. Create/resume the `AudioContext` on the first tap (e.g. the Play button or a "Tap to begin" splash).
- Use `100dvh` for full-height layouts (avoids the iOS address-bar jump).
- Apple PWA meta tags: `apple-mobile-web-app-capable`, status-bar style, and an `apple-touch-icon`.

### 2.3 Project Structure
```
worship-tiles/
├── index.html
├── manifest.webmanifest
├── sw.js                          // service worker (offline cache)
├── css/
│   └── style.css
├── js/
│   ├── main.js                    // boot, screen router, global state
│   ├── state.js                   // settings + player profile + save/load
│   ├── audio.js                   // AudioContext, sound toggle, SFX, menu music
│   ├── screens/
│   │   ├── menu.js
│   │   ├── howto.js
│   │   ├── library.js
│   │   ├── store.js
│   │   ├── results.js
│   │   └── settings.js            // calibration, backup export/import
│   └── game/
│       ├── game.js                // game loop, canvas drawing
│       ├── conductor.js           // audio-synced clock
│       ├── notes.js               // tap / hold / double-tap logic
│       ├── input.js               // pointer handling per lane
│       ├── judge.js               // timing windows + scoring
│       └── difficulty.js          // DifficultyConfig
├── songs/
│   ├── songs.json                 // catalog: metadata, prices, file paths
│   ├── audio/                     // one audio file per hymn
│   └── charts/                    // one chart JSON per hymn per difficulty
├── icons/                         // PWA icons (192, 512, apple-touch)
└── docs/
    ├── Worship-Tiles-Web-MDD.md
    └── LICENSING.md               // per-song license log
```

---

## 3. Screen Flow

```
Launch → Main Menu ─┬─ Play → Song Library → Song Select + Difficulty → Gameplay → Results → Song Library
                    ├─ Song Store (spend Bank)
                    ├─ How to Play
                    ├─ Settings (calibration, haptics, backup)
                    └─ Sound Toggle (inline)
```

Screens are `<section>` elements shown and hidden by a small router in `main.js`. No page reloads.

---

## 4. Screens & Features

### 4.1 Main Menu
**Theme:** warm, reverent, inspiring.
- **Background:** deep navy to gold-dawn gradient with soft light rays and a slow, subtle animation (CSS only). Optional faint stained-glass pattern.
- **Title:** "Worship Tiles" in an elegant serif font (Google Fonts such as Cormorant Garamond, self-hosted for offline use), with a small cross or open-Bible motif.
- **Buttons** (large touch targets): Play, Song Store, How to Play, Settings.
- **Sound toggle:** speaker icon in a top corner, persisted.
- **Bank balance** shown on the menu.
- **Footer:** short public-domain verse (KJV).
- **Menu music:** gentle instrumental hymn loop once a file is provided; muted when Sound is off.

### 4.2 Sound Toggle
- On/off, saved across sessions.
- Off mutes menu music and sound effects. **Song audio during gameplay also mutes** so the game is playable silently by sight (e.g. in a quiet room), while the notes and timing continue to run from the same clock. Show a small "Sound off" indicator on the gameplay screen.
- Implemented with a master `GainNode`.

### 4.3 How to Play
Swipeable cards (or tap-through) with simple animated demos:
1. **Watch the notes:** tiles fall down four lanes.
2. **Tap the lane:** tap when a note reaches the glowing line.
3. **Hold long notes:** press and hold tall tiles until the tail passes the line, then let go.
4. **Double-tap:** tiles marked "2" need two quick taps.
5. **Time it well:** Perfect, Great, Good, or Miss; better timing = more points.
6. **Pick your challenge:** Easy, Normal, or Hard per song; harder modes earn more coins.
7. **Earn and unlock:** your score goes into your Bank; spend it on more hymns.

"Got it" returns to the menu. Shown automatically on first launch.

### 4.4 Song Library
- Scrollable list of **owned** songs.
- Each row: title, composer/lyricist, best stars, and a Play button.
- Tapping a row opens a bottom sheet with title, year, a **difficulty selector (Easy / Normal / Hard)**, and the high score, stars, and best accuracy for the selected difficulty.
- **Play** starts the song at the selected difficulty.
- Locked songs appear dimmed with a price and a shortcut to the Store.
- 2–3 starter songs are free.

### 4.5 Song Store
- Locked hymns with their prices.
- Tap → confirm dialog ("Unlock *Rock of Ages* for 500?") → deduct from Bank → add to library.
- Not enough coins: button disabled with "Need X more".
- Optional 10-second audio preview.

### 4.6 Gameplay
See Section 5.

### 4.7 Results Screen
- Song title and difficulty played.
- Final score, accuracy %, max combo, per-judgment counts (Perfect / Great / Good / Miss), holds completed, double-taps landed.
- Star rating (1–3 stars, thresholds vary by difficulty).
- "New High Score!" banner when applicable.
- **Bank reward:** animated count-up converting score to coins added to the Bank.
- Buttons: Play Again, Song Library, Main Menu.

### 4.8 Settings
- **Haptics toggle** (uses `navigator.vibrate` where supported; hidden or disabled on iOS).
- **Audio calibration:** latency offset slider (−200 ms to +200 ms) with a simple "tap along to the beat" test. Saved to profile.
- **Backup:** Export Save (downloads JSON) and Import Save (file picker). Protects the Bank and unlocks if browser data is cleared.
- **Reset progress** (with confirmation).

---

## 5. Core Gameplay

### 5.1 Layout (Portrait)
- Canvas fills the safe area, scaled by device pixel ratio for sharpness.
- **4 equal vertical lanes.**
- **Hit line** about 15–20% up from the bottom, above the home indicator safe area.
- HUD at top: score, combo, song progress bar, pause button.

### 5.2 Notes
- Notes spawn above the screen and scroll down at a constant speed in their lane.
- Scroll speed depends on difficulty.

**Note types (all in v1.0):**

| Type | Look | Player action |
|---|---|---|
| **Tap note** | Rounded tile | Tap the lane as the tile crosses the hit line |
| **Hold note** | Tall tile (length = duration) with a glowing tail | Touch down as the head crosses the line, keep the finger on the lane until the tail passes the line, then release |
| **Double-tap note** | Tile with a "2" or twin-ring marker | Tap the lane twice quickly (within ~250 ms) as the tile crosses the line |

- Hold notes glow and pulse while held and award points continuously.
- Double-taps show a small "1/2" tick after the first tap.
- Easy mode limits which note types appear (see 5.10).

### 5.3 Input
- Pointer Events on the canvas; each active pointer is mapped to a lane by its x position, tracked by `pointerId`.
- Multi-touch: the player can hold a note in one lane while tapping others.
- A pointer that slides out of its lane during a hold counts as a release.
- `pointercancel` is treated as a release.
- Tapping an empty lane with no nearby note is ignored (no combo break), keeping the game gentle.
- Keyboard fallback for desktop testing: `D F J K` for lanes 1–4.

### 5.4 Timing Windows (starting values, tunable)
| Judgment | Window (± from perfect) | Base points |
|---|---|---|
| Perfect | ±50 ms | 100 |
| Great | ±100 ms | 70 |
| Good | ±150 ms | 40 |
| Miss | beyond ±150 ms or note passes the line | 0, combo reset |

Windows are scaled by difficulty (5.10).

**Hold note rules:**
- The **head** is judged with the standard windows.
- While held, bonus points tick up at a steady rate (e.g. 10 per 100 ms); combo does not break.
- Releasing within ±150 ms of the tail crossing the line completes the hold (+50 "Hold Complete"). Releasing earlier breaks the hold: head score kept, bonus stops, combo resets.
- If the head is missed, the whole hold counts as one Miss.

**Double-tap note rules:**
- First tap judged with the standard windows; second tap must follow within ~250 ms.
- Both landed → first tap's judgment plus +30 "Double" bonus.
- Second missed → counts as a Good at best; combo breaks.
- Both missed → one Miss.

### 5.5 Scoring
- Points per note = base points × combo multiplier.
- Combo multiplier: ×1 (0–9), ×1.5 (10–24), ×2 (25–49), ×3 (50+).
- Final score drives stars and the Bank reward.

### 5.6 Bank Conversion
- Bank reward = (final score ÷ 10, rounded down) × difficulty multiplier.
- Multipliers: **Easy ×1.0, Normal ×1.5, Hard ×2.0.**
- Replays always earn coins (no cap in v1.0).

### 5.7 Song Sync (Critical)
- **Conductor clock:** note positions are computed from `audioContext.currentTime` (the audio hardware clock), minus a calibration offset. Never use frame deltas or `Date.now()` to place notes, or they will drift from the music.
- Songs are decoded once into an `AudioBuffer` and started with `source.start(startTime)` at a scheduled time.
- A short count-in (e.g. 3 beats, visual only) precedes the first note.
- Each song has chart JSON files listing notes with time, lane, type, and duration.
- Test timing on a real phone (Safari audio latency differs from desktop); use the calibration slider to tune.
- Pause: `audioContext.suspend()` / `resume()`; the Conductor freezes with the context clock automatically.
- Handle `visibilitychange`: pause the game when the tab/app goes to the background.

### 5.8 Win / Fail
No fail state. The song always plays to the end.

### 5.9 Pause
- Pause button freezes audio and notes. Overlay: Resume, Restart, Quit.
- 3-second countdown on resume.

### 5.10 Difficulty Modes (Easy / Normal / Hard)
Every song ships with **three charts**, chosen by the player before Play.

| | Easy | Normal | Hard |
|---|---|---|---|
| Note density | Melody highlights only | Most of the melody | Full melody with fast runs |
| Note types | Tap + a few holds | Tap + hold + occasional double-tap | All types, frequent |
| Scroll speed | Slow | Medium | Fast |
| Timing windows | Wider (×1.25) | Standard | Tighter (×0.85) |
| Lane changes | Gentle, mostly adjacent | Mixed | Wide jumps, quick alternations |
| Bank multiplier | ×1.0 | ×1.5 | ×2.0 |
| Star thresholds | Lower | Standard | Higher |

- Default is Easy on a song's first play; the last-used difficulty is remembered per song.
- All three difficulties are available as soon as the song is owned.
- High scores, stars, and accuracy are tracked per song and per difficulty.
- Difficulty tuning lives in `difficulty.js` (one `DifficultyConfig` object) so values can be adjusted without touching charts.

---

## 6. Songs & Content

### 6.1 Licensing Policy
All songs are **public domain hymns**. Even for personal use, keep this clean:
- Hymn text and melody being public domain does not automatically make a **specific recording** public domain. Use recordings you make yourself (rendered from MIDI with a free soundfont, or played by you) or recordings verified as public domain/CC0.
- Keep `docs/LICENSING.md` listing, for each song: title, lyricist/composer, year, audio source, license status.
- Avoid copyrighted modern arrangements and recent English translations.

### 6.2 Candidate Hymns (verify each before including)
| Hymn | Notes |
|---|---|
| Amazing Grace | Text 1779 (Newton); traditional melody |
| Holy, Holy, Holy | Text 1826 (Heber); Nicaea melody 1861 |
| It Is Well With My Soul | Text 1873 (Spafford); Bliss melody 1876 |
| A Mighty Fortress Is Our God | Luther, 1529 |
| Come Thou Fount of Every Blessing | Text 1758; traditional melody |
| Rock of Ages | Text 1763 |
| Blessed Assurance | Text 1873 |
| What a Friend We Have in Jesus | Text 1855 |
| O for a Thousand Tongues to Sing | Text 1739 |
| Crown Him with Many Crowns | Text 1851 |
| Fairest Lord Jesus | Traditional |
| Nearer, My God, to Thee | Text 1841 |
| Just As I Am | Text 1835 |
| Abide With Me | Text 1847 |
| Come, Thou Almighty King | Anonymous, 1757 |
| All Hail the Power of Jesus' Name | Text 1779 |
| How Great Thou Art / Great Is Thy Faithfulness / Be Thou My Vision | **Check:** English text copyright varies; verify or omit |

### 6.3 Song Catalog Format (`songs/songs.json`)
```json
{
  "songs": [
    {
      "id": "amazing-grace",
      "title": "Amazing Grace",
      "credit": "Words: John Newton (1779)",
      "bpm": 72,
      "price": 0,
      "audio": "songs/audio/amazing-grace.mp3",
      "charts": {
        "easy": "songs/charts/amazing-grace-easy.json",
        "normal": "songs/charts/amazing-grace-normal.json",
        "hard": "songs/charts/amazing-grace-hard.json"
      },
      "previewStart": 0
    }
  ]
}
```

### 6.4 Chart Format (`songs/charts/*.json`)
```json
{
  "songId": "amazing-grace",
  "difficulty": "easy",
  "notes": [
    { "time": 2.0, "lane": 1, "type": "tap" },
    { "time": 3.5, "lane": 2, "type": "hold", "duration": 1.2 },
    { "time": 6.0, "lane": 0, "type": "doubleTap" }
  ]
}
```
- `time`: seconds from the start of the audio.
- `lane`: 0–3.
- `type`: `tap`, `hold`, or `doubleTap`.
- `duration`: seconds, hold notes only.

### 6.5 Charting Workflow
Charting is three times the work (three difficulties per song). Plan:
1. Build a small **chart recorder mode** (hidden dev screen): play the song, tap or hold along, export the timings as JSON.
2. Record the **Hard** chart first, then derive Normal and Easy by thinning notes and swapping types, then hand-tune.
3. Launch with 3 songs; add more over time.

### 6.6 Economy (starting values)
- Free starters: 2–3 hymns.
- Prices: easy hymns 300–500; medium 600–900; hard 1000–1500.
- A good run earns roughly 100–250 coins, so a new song unlocks after about 2–5 plays. Tune by playing.

---

## 7. Art & Audio Direction

### 7.1 Visual Style
- Palette: deep navy, warm gold, soft cream, with muted stained-glass jewel tones for accents.
- Fonts: serif display for titles, clean sans-serif for UI. Self-host fonts so the game works offline.
- Tiles: soft rounded rectangles with a gentle glow on hit; light-burst particles on successful hits.
- Lane dividers: thin and subtle; the lane flashes on tap.
- Judgment text ("Perfect", "Great", "Good", "Miss") floats briefly near the hit line.
- Backgrounds: calm, reverent scenes (sunrise, stained glass), optionally one per song.
- Icons: simple inline SVG (cross, speaker, pause, gear).

### 7.2 Audio
- Menu: gentle instrumental hymn loop.
- Gameplay: the hymn plays untouched; misses do not alter the music.
- SFX: soft chime on hit, subtle tone on miss, short uplifting jingle on results. Generate with Web Audio oscillators if no files are provided.
- Formats: `.mp3` or `.m4a` (AAC) for iOS compatibility. Avoid `.ogg` (not supported in Safari).

---

## 8. Data Persistence

Stored in `localStorage` under one key (e.g. `worshipTiles.save.v1`), as JSON:
```json
{
  "version": 1,
  "settings": { "soundEnabled": true, "hapticsEnabled": true, "latencyOffsetMs": 0 },
  "profile": {
    "bank": 0,
    "ownedSongIds": ["amazing-grace"],
    "highScores": { "amazing-grace": { "easy": { "score": 0, "stars": 0, "accuracy": 0 } } },
    "lastDifficulty": { "amazing-grace": "easy" },
    "hasSeenTutorial": false
  }
}
```
- Wrap all reads and writes in try/catch; fall back to defaults if storage is unavailable or corrupt.
- Include a `version` field for future migrations.
- Export/Import backup in Settings (4.8). Request persistent storage with `navigator.storage.persist()` where available.

---

## 9. Accessibility & Safety
- Large touch targets (at least 44×44 px).
- Sufficient color contrast; judgment feedback uses text labels, not color alone.
- ARIA labels on menu buttons; respect `prefers-reduced-motion` (turn off background animation and particles).
- Haptics and sound toggles.
- No ads, accounts, analytics, or network calls beyond loading the site itself.

---

## 10. Development Plan (Claude Code in VS Code)

### Phase 1: Foundation
- Create repo and file structure; `index.html`, CSS base, screen router, `state.js` save/load.
- Mobile fixes: viewport, safe areas, no scroll or zoom, landscape-rotate overlay.

### Phase 2: Menus
- Themed Main Menu, sound toggle (with audio unlock), How to Play, placeholder Library/Store/Settings.

### Phase 3: Core Gameplay
- Canvas game loop, four lanes, falling tap notes from a hardcoded chart, Conductor clock, input, judgments, scoring.

### Phase 3b: Advanced Notes & Difficulty
- Hold notes and double-tap notes; `DifficultyConfig`; per-difficulty chart loading.

### Phase 4: Content & Charting
- Audio for 3 starter hymns; chart recorder; three charts each.
- Song Library with difficulty selector.

### Phase 5: Economy
- Results screen, Bank conversion, Song Store, unlock flow, persistence.

### Phase 6: Polish
- Particles, animations, pause menu, SFX, calibration slider, backup export/import.

### Phase 7: PWA & Deploy
- Manifest, icons, service worker (offline cache), GitHub Pages deployment, "Add to Home Screen" test on the phone.

---

## 11. Deploy & Install
1. Push the project to a GitHub repository and enable **GitHub Pages** (Settings → Pages → deploy from the main branch).
2. Open the Pages URL in Safari (iPhone) or Chrome (Android).
3. **iPhone:** Share → Add to Home Screen. **Android:** menu → Install app.
4. After updates, bump the service worker cache version so phones pick up new files.

---

## 12. Risks & Open Questions
| Risk / Question | Mitigation |
|---|---|
| Audio latency on iOS Safari | Schedule audio on the Web Audio clock; calibration slider; test on a real phone |
| iOS ignores portrait lock | Landscape detection with a rotate overlay |
| Audio won't play until a tap | Unlock `AudioContext` on first user gesture |
| Saved data lost if Safari data is cleared | Export/Import backup; request persistent storage |
| Service worker serving stale files after updates | Versioned cache name; update flow |
| Charting is 3× the work | Chart recorder; derive Easy/Normal from Hard; start with 3 songs |
| Hold notes with multi-touch feel buggy | Track pointers by ID; forgiving release window; test on device |
| "Double-tap" interpretation | Defined as two quick taps in one lane; two-lane "chord" notes are a future idea |
| Recording copyright confusion | Make or verify recordings; keep `LICENSING.md` |
| Haptics unavailable on iPhone | Treat as optional; hide the toggle where unsupported |

---

## 13. Future Ideas
- Two-lane simultaneous "chord" notes
- Daily verse bonus coins
- Song packs (Christmas carols, Easter hymns, Psalms)
- Custom themes and backgrounds purchasable with the Bank
- Share-your-score image
- Optional cloud sync (e.g. Supabase) if progress needs to follow across devices
- Native iOS port later if you ever want App Store distribution
