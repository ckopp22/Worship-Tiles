# Licensing log

Every song that ships has a row here (MDD 6.1). Hymn text and melody being public domain does not make a
specific recording public domain, so the audio source is tracked separately.

Last reviewed: 2026-10-15. This is a working record, not legal advice.

**Audio for every song** is an owner-supplied file (instrumental, MIDI-style render). For each one, the project
owner still needs to record where the MIDI/arrangement and soundfont came from and confirm it can be shared
publicly. Long songs are trimmed to about a minute with a fade-out by `tools/trim_audio.mjs` (originals untouched).

| Song (id) | Words / music | Year | Audio file | Status |
|---|---|---|---|---|
| Amazing Grace (`amazing-grace`) | Words: John Newton. Melody: NEW BRITAIN, traditional American tune | Words 1779; tune early 19th c. | `songs/audio/amazing-grace.mp3` | Words and melody: public domain. Recording: confirm source |
| Rock of Ages (`rock-of-ages`) | Words: Augustus Toplady. Tune: TOPLADY, Thomas Hastings | 1763; 1830 | `songs/audio/rock-of-ages.mp3` | Words and melody: public domain. Recording: confirm source |
| The Old Rugged Cross (`old-rugged-cross`) | Words and music: George Bennard (died 1958) | 1912 | `songs/audio/old-rugged-cross.mp3` | **Public domain in the US; still protected in countries using life+70 (until about 2028).** Decide whether to ship publicly. Recording: confirm source |
| How Great Thou Art (`how-great-thou-art`) | Words: Carl Boberg (Swedish). Melody: Swedish folk tune. English text and arrangement by Stuart Hine (1949/1953) are **copyrighted** | 1885 | `songs/audio/how-great-thou-art.mp3` | **Verify before sharing.** The audio is instrumental; confirm it uses the traditional folk melody and not Hine's arrangement. The credit in the app names only Boberg and the folk melody |
| Holy, Holy, Holy (`holy-holy-holy`) | Words: Reginald Heber. Tune: NICAEA, John B. Dykes | 1826; 1861 | `songs/audio/holy-holy-holy.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| Blessed Assurance (`blessed-assurance`) | Words: Fanny J. Crosby. Music: Phoebe P. Knapp | 1873 | `songs/audio/blessed-assurance.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| What a Friend We Have in Jesus (`what-a-friend-we-have-in-jesus`) | Words: Joseph Scriven. Music: Charles C. Converse | 1855; 1868 | `songs/audio/what-a-friend-we-have-in-jesus.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| Come, Thou Fount of Every Blessing (`come-thou-fount`) | Words: Robert Robinson. Tune: NETTLETON, traditional American | 1758; about 1813 | `songs/audio/come-thou-fount.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| Abide With Me (`abide-with-me`) | Words: Henry F. Lyte. Tune: EVENTIDE, William H. Monk | 1847; 1861 | `songs/audio/abide-with-me.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| Be Thou My Vision (`be-thou-my-vision`) | Ancient Irish hymn. English text: Eleanor Hull. Tune: SLANE, traditional Irish | 8th c.; 1912 | `songs/audio/be-thou-my-vision.m4a` (trimmed) | Public domain in the US (Hull's 1912 text); other English versions may not be. The audio is instrumental, so only the melody matters: confirm it is the traditional SLANE tune. Recording: confirm source |
| I Need Thee Every Hour (`i-need-thee-every-hour`) | Words: Annie S. Hawks. Music: Robert Lowry | 1872 | `songs/audio/i-need-thee-every-hour.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |
| Crown Him with Many Crowns (`crown-him-with-many-crowns`) | Words: Matthew Bridges (1851), Godfrey Thring (1874). Tune: DIADEMATA, George J. Elvey | 1851; 1868 | `songs/audio/crown-him-with-many-crowns.m4a` (trimmed) | Words and melody: public domain. Recording: confirm source |

The built-in synthesized test track (`js/testsong.js`) is original to this project and is only used as a fallback if a song's audio fails to load.

## Rules for adding a song

1. Confirm the words and the tune are public domain (published before 1931 in the US, and ideally an author who died before about 1955).
2. Avoid modern arrangements, modern harmonizations and recent English translations.
3. Use a recording you made yourself, or one verified public domain / CC0, and note where it came from.
4. Add a row above before the song ships.
