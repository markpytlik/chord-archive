# Chord Keeper — Audit

Two passes through the codebase: one from a senior engineer reviewing the technical health, one from a piano/guitar teacher who actually has to use this thing in lessons.

---

## I. Senior engineer review

### What's working

- **Zero-build single-file architecture** is genuinely the right call for a personal app. No deploy pipeline, no node_modules to drift, no framework version churn. Anyone can fork and run `python -m http.server` to hack on it.
- **Persistence model** (localStorage + embedded `<script id="seed-data">` JSON for first-load) is small and dependable.
- **Per-occurrence voicing storage** is a sharp data-model choice — keying by `chordName + "@" + occIdx` is exactly what the per-position semantics require, and it composes cleanly with global voicings via the lookup-precedence chain.
- **GitHub Pages + custom domain + CNAME-driven rename** worked on first try because the file is self-contained.

### What's quietly fragile

1. **`renderLyrics` is now load-bearing for play-mode focus tracking.** Lines are wrapped in `.lyric-line` and JS walks the DOM to mark `.active`. Any change to the wrapping (e.g. someone rewraps mixed lines) silently breaks the dot indicator. There's no test covering this. Either:
   - Add a one-shot smoke test that renders a known song and asserts `.lyric-line` count + `data-occ` presence, or
   - Move the focus tracker off DOM-walking and onto an explicit position model (line index → element ref) computed once per render.

2. **Occurrence indexing relies on render-time order matching parse-time order.** `nextOcc()` increments per chord during `renderLyrics`. The voicing editor receives that index. If you ever change the rendering pass to re-order chords (e.g., a "chord-only summary line" feature), per-occurrence voicings get silently scrambled. Worth adding `data-occ` at parse time and never recomputing.

3. **Live JS in `index.html` is approaching ~3500 lines**, with several functions doing too much:
   - `openVoicingEditor` is now ~200 lines and reaches into 6 different layout cases. The save handler alone has 4 distinct branches. It's the highest-risk function in the codebase.
   - `renderDetail` builds HTML, attaches every event listener inline, and re-renders the whole detail panel on every change. Fine for a one-user app, but the listener teardown is implicit (whole node replaced) — easy to leak if anything ever holds a closure.
   - `openPlayMode` mixes scroll loop, focus tracking, shape rendering, scrub slider, drag handle, keyboard shortcuts. Each subsystem could be its own factory.

4. **State mutation via shared references.** `song` objects are passed around and mutated in place; `state.songs` holds the same references. Works because there's only one selected song at a time, but if you ever introduce concurrent operations (e.g., a background sync), you'll have hard-to-reproduce inconsistencies. Switching `pushUndo` to a structural snapshot already does the right thing; consider making all mutation go through a single `mutate(songId, fn)` helper that snapshots, applies, and saves.

5. **Dead code drift.** `_legacy_svgPiano_unused` is still in the file. There's also a migration shim for `customShapes` / `voicingNotes` that you can probably retire if no live data still has the old format. Worth a one-time inventory and prune.

6. **No defensive parsing on chord input.** `splitChord("Csus9")` silently returns null in edge cases I didn't trace; `qualityToIntervals` returns `[0, 4, 7]` (major) as a fallback for unknown qualities, which is misleading — the user gets a major-triad piano voicing for an unrecognized chord and doesn't know it. Either show a "couldn't parse" warning or fall back more honestly.

7. **Guitar shape derivation has correctness gaps.** The new A-shape `add9` template is identical to the `maj9` template — copy-paste error worth chasing. Voicings for sus2 templates put the 2 in awkward octave positions on some keys; ideally each derived shape should be sanity-checked by computing the actual notes and verifying intervals match the requested quality.

8. **`saveState` overwrites the entire `state.songs` array on every change.** localStorage write is synchronous and serializes the whole library each time. Once you have hundreds of songs this becomes a perceptible jank during transpose/voicing edits. The fix is per-song writes keyed by id, but you have to handle the migration.

9. **Accessibility is essentially absent.**
   - Modals don't trap focus, don't return focus to the trigger element, and the close-on-outside-click is mouse-only.
   - The color-coded chord pills, chord-change dot, and root-vs-non-root piano keys don't degrade for color-blind users — only color distinguishes them.
   - The accidental toggle, transpose buttons, and play-mode controls have `aria-label` set, which is good. But the chord pill itself has no role/label, so a screen reader hears just "C" without any indication it's interactive.
   - No keyboard navigation in the editor — you can't tab to a chord pill and press Enter to open it.

10. **No error boundary.** Any thrown exception in `renderDetail` blanks the panel with no recovery. The voicing-editor save errors (Invalid frets, etc.) use `alert()` which is jarring and accessibility-hostile.

11. **The bookmarklet, the extension popup, and `chordkeeper.markpytlik.com/#new=` flow all duplicate scraper logic.** Three places to update if Ultimate Guitar changes its DOM. Extracting the scraper into a single function (loaded via `<script>` from a known URL or just inlined identically) would consolidate maintenance.

12. **HTTPS is still serving the github.io wildcard cert** (per the curl I ran earlier). Need to nudge GitHub Pages to provision the per-domain cert before flipping on Enforce HTTPS.

### Performance

- `renderDetail` re-runs on every transpose, voicing edit, accidental toggle. For a 20-line song this is fine. For a 200-line song it's noticeable. Switch to a finer-grained re-render of just the lyrics section once you're routinely editing big charts.
- Play-mode `requestAnimationFrame` loop runs at full 60fps even when the song is paused-with-shapes-off. Cheap, but unnecessary. Could short-circuit when there's nothing to do.
- The popover/shape SVG generation runs on every hover. Memoize by chord name + voicing index.

### What I'd ship next as engineering hygiene

1. Extract `splitChord` / `qualityToIntervals` / shape derivation into a `chord-theory.js` script tag with no DOM dependencies, then add a small test harness (`<script id="tests">` that runs assertions and logs results). 200 lines of asserts would catch ~80% of the music-correctness regressions before they ship.
2. Centralize the "rename + voicing scope" decision tree into a single pure function that takes `(currentSong, edit, scope)` and returns the next song state. Then `doSave` becomes one line of glue. The current branching is the highest-bug-density code in the project.
3. Replace the in-place edit pattern with snapshot+apply. `pushUndo` already snapshots; finish the job by making every mutation go through it.
4. Add a `data-version` attribute on the body and a tiny "what changed" toast on first load after a deploy, so you stop relying on the user to hard-refresh.

---

## II. Music teacher review

### What works for actual practice

- **Per-occurrence voicings.** A real teaching insight: the same chord name often wants different voicings in different parts of a song (open Em7 in the verse vs barre Em7 at the 7th fret in the chorus). Most chord apps don't model this. Yours does.
- **Transpose with original-key reset.** Crucial for accompanying singers; the ↺ to bounce back is the right affordance.
- **Sharp/flat toggle, with consistent accidental rewriting.** Singers think in flats, guitarists often in sharps. Letting the chart re-spell without re-typing is huge.
- **Play mode with adjustable scroll speed.** This alone makes it more useful than a static lyrics page.
- **Chord-shape panel that follows the song.** As a piano teacher I'd kill for this in a tool I could give students — a kid sight-reading a song needs to see THE shape for the chord coming up, not flip pages.

### What's musically wrong or misleading

1. **No capo arithmetic.** You store `song.capo` and display "Capo 3", but transpose doesn't account for it. A guitarist with capo 3 reading a chord chart written in C is actually playing chords shaped as A. The diagrams should optionally show "shape names" not "sounding pitches." This is the single biggest gap between this tool and how guitarists actually learn.

2. **Piano voicings stack mechanically from the root, ignoring voice-leading.** The auto-suggestion for Cmaj7 → Fmaj7 produces two unrelated stacks instead of the voice-led C-E-G-B → C-E-A-F (common-tone smooth motion). For learners this teaches the *wrong* habit — every chord becomes a separate hand position. Even a cheap heuristic ("keep tones in common where possible") would be a major improvement.

3. **Built-in major/minor are hidden in mixed-instrument mode.** The reasoning ("user already knows them") fails for beginners and for guitarists encountering F#m at fret 2 for the first time. The recent guitar-only-shows-everything change is right; consider making it the default for mixed mode too, with a "hide common chords" preference.

4. **Slash chords on guitar fall back to E-shape templates without honoring the bass note.** A C/E should put E in the bass (open low E), not just play C major. This is one of the most common voicings in pop/rock and the current code can't render it.

5. **No 7sus, 9sus, 11, 13, alt, dim, dim7, m7b5.** These appear constantly in jazz, modern pop, and church music. Without them the app silently degrades to "no diagram" on the chords that most need teaching.

6. **The chord auto-detection from notes isn't enharmonic-aware.** If a student clicks the keys for a Db major chord (Db-F-Ab), the app might call it C#-F-G#, which is technically correct but pedagogically wrong if the song is in Db. The `preferFlat` setting helps but isn't always picked up.

7. **No indication of which finger plays which note** in the suggested piano voicings. This matters for piano students more than for guitar (where finger numbers ARE shown). Even basic L/R hand split would help.

8. **The chord-change dot moves with scroll, but there's no beat or time indication.** A student can't use this to practice in time — they don't know if a chord lasts a beat, two beats, a whole measure. No bar lines. No time signature. Real practice needs at minimum: beat per chord (1, 2, 4, 8), bar lines, and ideally tempo.

### Missing for serious practice use

In rough order of impact:

1. **Section repeat / loop.** "Practice the bridge until you've got it" requires being able to mark `[Bridge]` and play just that section on loop. The data model already has section labels; needs play-mode UI: tap a section name to set loop bounds.

2. **Metronome.** A click track at user-set BPM, optionally with downbeat emphasis. Could share the same play-mode timing engine.

3. **Beat markers in the lyrics.** Even if you don't add a metronome, showing "this chord lasts 4 beats" via spacing or marker widths would be a step up.

4. **Audio playback of the chord** (just a short voiced sample on hover/click). Lets a student check their ear without reaching for an instrument.

5. **Roman-numeral analysis.** Optionally label each chord with its function (I, IV, V, vi) given the song's key. Teaches harmony in passing without forcing a separate lesson.

6. **Practice timer / streak.** Even a simple "you practiced this song N times" counter creates motivation.

7. **Lyrics-only mode.** For when a student is working purely on melody/words and doesn't need chords.

8. **Print/PDF export.** For students who genuinely want a paper chart in front of the music stand.

9. **Linked songs / setlists.** "My current setlist for the recital" — a curated subset of the library, shareable as a single URL.

10. **Recording.** Record a take while watching the chart, save it with the song. This is what would actually make students practice — being able to hear their own progress over weeks.

### Smaller things a teacher would notice

- **The hover popover is fast and clean but disappears the moment your cursor leaves a chord pill.** A student trying to study a shape needs ~3 seconds to look at it. The 200ms hide delay you have helps slightly, but consider a "pin on click" that keeps it open until dismissed.
- **The voicing editor shows piano notes by pitch class name (C, F#) but the F-to-E keyboard layout.** For piano students this is the wrong mental model — they think in octaves, not pitch classes. Consider labeling notes with octave (C4, F#5) and showing a Middle C marker.
- **The "Standard" vs "Custom" naming is good but doesn't tell you HOW the shapes differ.** A small note like "open shape" / "barre shape" / "rootless" would help students understand voicing choices.
- **No "this chord is hard" tag.** Teachers and students could mark trouble spots; the app could highlight them in play mode. Five minutes of work, big practice value.

### What I'd actually add next as a teaching tool

If we picked **one** thing to add that would most change how this gets used: **section loop in play mode**. Tap a section name to repeat just that section at any tempo, with the chord shapes visible. That single feature would convert this from a chord-display app into a practice partner.

Second pick: **capo-aware diagrams** — show shapes as "what your fingers do" rather than "what the chord sounds like" when capo > 0. This is the difference between a transcription viewer and a guitar teacher.

---

## Closing notes

The architecture is right for what this is — a personal practice tool that doesn't need to scale to other users. The risks are concentrated in two places: the voicing-editor save logic (which has had three rounds of regressions in this conversation) and the assumption that the renderer's incidental DOM structure (occurrence indexes, line wrappers) will stay stable. Both deserve a pure-function refactor before adding more features.

On the music side, you've built the chord-display layer well. The next leap is play-mode practice features — loop, tempo, capo logic — which is where this would stop being a "songbook" and become a "practice partner."
