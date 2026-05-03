# Chordpad

Live at [chordpad.app](https://chordpad.app/).

A personal songbook for chords, lyrics, and your own preferred voicings.
Static site — no server, no build step. Open `index.html` in any modern browser.

## Quick start

1. Double-click `index.html` to open it in your browser.
2. Click **+ New Song** to add one.
3. Two ways to get a starting chord chart:
   - **Browser extension** — install `chordpad-1.5.1.xpi` (Firefox) or load the `extension/` folder unpacked (Chrome). Click the extension's Grab button on any chord page and the song is sent into Chordpad. Reliable on sites that block server-side fetches (Ultimate Guitar, etc.).
   - **Parse pasted sheet** — copy a "chords on line above lyrics" sheet from anywhere, paste into the lyrics field, click **Tidy & align**. Works for any source.
4. **Hover** any chord above the lyrics to see a guitar diagram + piano keyboard inline (with your custom shape if saved).
5. **Click** a chord to open the editor — save a custom guitar shape (e.g. `x32000` for Cmaj7) and a per-song voicing note.
6. **Export** any time to download a `chord-archive.json` backup. **Import** restores from one.

## Lyric format

Inside the lyrics field the app uses a simple ChordPro-style syntax:

```
{Verse 1}
[Cmaj7]Twinkle twinkle [G]little [Am]star
[F]How I [C]wonder [G]what you [C]are
```

- `[ChordName]` before a syllable places the chord above that point in the line.
- `{Section Label}` (or `{Verse}`, `{Chorus}`, etc.) renders as a section header.
- The **Parse pasted sheet** button accepts the alternative format too:

  ```
       C       G       Am      F
  Twinkle twinkle little star
  ```

## Per-song custom voicings

Two layers of customization per song:

1. **Phrasings & voicing notes** — a free-text field on each song for general notes ("verse uses fingerpicking, alternating bass on Am…").
2. **Per-chord custom shape & voicing note** — open any chord's modal (click) and:
   - Save a custom guitar shape (e.g. `x32000` instead of the default `x32010` for C). The custom shape then renders in the hover popover whenever that chord appears in this song.
   - Save a per-chord voicing note that surfaces in the popover too.

These overrides live on the song itself and travel with it in your JSON exports.

## Importing chord charts

The browser extension is the only built-in import path. It runs in your real browser session, so it's not blocked by the bot-protection that breaks server-side fetches:

- **Ultimate Guitar** — reads the embedded `js-store` JSON and converts `[ch]X[/ch]` markup to the app's `[X]` format.
- **E-Chords** — pulls the `<pre id="core">` content.
- **Generic fallback** — finds the largest `<pre>` block on the page.

The extension hands the scraped song off to an already-open Chordpad tab when one exists; otherwise it opens a new tab. For everything else, copy the chord chart from the source page and paste it into the lyrics field — **Tidy & align** parses chord-line-above-lyrics format and re-aligns chords cleanly.

## Data model

Songs live in your browser's `localStorage` under the key `chordarchive_v1`.
On first open, if your collection is empty, the app loads the embedded `<script id="seed-data">` block (so it works on `file://` too) or `data.json` (if served).

A song looks like:

```json
{
  "id": "abc123",
  "title": "Wonderwall",
  "artist": "Oasis",
  "key": "Em7",
  "capo": 2,
  "instruments": ["guitar", "piano"],
  "sourceUrl": "https://…",
  "lyrics": "{Verse}\n[Em7]Today is gonna be the day [G]that…",
  "notes": "Verse: Em7 → G → D → A7sus4. Light strumming.",
  "customShapes": { "Em7": { "frets": [0, 2, 0, 0, 0, 0] } },
  "voicingNotes": { "Em7": "Open shape, let everything ring" },
  "createdAt": 1745529600000,
  "updatedAt": 1745529600000
}
```

Frets array: 6 numbers, low E → high E. `-1` = muted, `0` = open, `>0` = fret number.

## Backup & sync

The app stores everything in your browser. To back up or sync to another device:

- **Export** writes a JSON file you can keep in iCloud / Dropbox / Git.
- **Import** merges a JSON file (newer `updatedAt` wins per song).

If you want the seed `data.json` to reflect your collection, drop your latest export over it and re-deploy.

## Deploying as a real website

### GitHub Pages
1. Push this folder to a GitHub repo.
2. In Settings → Pages, set Source to `main` branch / root folder.
3. Visit `https://<username>.github.io/<repo-name>/`.

### Netlify
Drag-and-drop the folder onto https://app.netlify.com/drop.

### Cloudflare Pages
Connect the repo, build command empty, output directory `/`.

In all cases, edits you make in your browser stay in *that* browser's localStorage. To ship updates, periodically Export and replace `data.json` (and the inline seed block in `index.html`) before redeploy.

## Roadmap ideas

- Transpose button (shift all chords up/down a step).
- Capo-aware diagram rendering.
- Larger built-in chord shape library (jazz voicings, drop-2/drop-3).
- Audio playback / metronome / setlists.
- Browser bookmarklet for one-click import from any chord page.
