# Chord Archive — Browser Extension

One-click chord-chart capture for [Chord Archive](https://songs.markpytlik.com/).
Same logic as the bookmarklet, but as a permanent toolbar button.

## What it does

1. Click the toolbar button on any chord page.
2. The popup says what page it sees; click **Grab chords from this page**.
3. The chord chart gets converted to ChordPro format and copied to your clipboard.
4. Chord Archive opens in a new tab — paste into the lyrics field, click **Parse pasted sheet**.

Site-specific parsers for **Ultimate Guitar** (extracts the embedded `js-store` JSON
and converts `[ch]Cmaj7[/ch]` → `[Cmaj7]`), **E-Chords**, and **Chordie**, with a
generic `<pre>`-based fallback for everything else.

## Install (Firefox)

Firefox doesn't allow self-signed extensions to run permanently outside the AMO
store. Two options:

### Option A — Temporary install (lasts until Firefox restarts)
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` inside this folder.

Good for testing. You'll need to re-load it on each Firefox restart.

### Option B — Permanent (Firefox Developer Edition or Nightly only)
1. Open `about:config`, set `xpinstall.signatures.required` to `false`.
2. Zip the contents of this folder (just the files, not the parent folder).
   Rename to `chord-archive.xpi`.
3. Drag the `.xpi` into Firefox.

For everyday use, signing the extension and submitting to AMO is the right path.

## Install (Chrome / Edge / Brave)

Chrome accepts unsigned extensions in developer mode without restarting:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select this folder

Done. The extension stays installed across restarts.

## Files

- `manifest.json` — MV3 manifest, works in Firefox 109+ and Chrome 88+.
- `popup.html` / `popup.js` — toolbar popup UI.
- `icon.svg` — extension icon (a music note in the Chord Archive accent color).

## Permissions

- `activeTab` — read the page you're currently on (only when you click the button).
- `scripting` — inject the scraper into the active tab.
- `clipboardWrite` — copy the chord chart to your clipboard.
- `host_permissions: <all_urls>` — required so the scraper can run on any chord site.

The extension does NOT track you, send data anywhere, or read pages you haven't
explicitly clicked the button on.
