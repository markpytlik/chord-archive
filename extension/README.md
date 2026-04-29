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

Pre-built `.xpi` is at the repo root, versioned per release. Latest:
[`chord-archive-grabber-1.2.0.xpi`](https://github.com/markpytlik/chord-archive/raw/main/chord-archive-grabber-1.2.0.xpi)

Older versions remain in the repo root for rollback if needed.

Firefox doesn't permanently install unsigned `.xpi` files in regular Firefox.
Three options, in order of permanence:

### Option A — Temporary install (lasts until Firefox restarts)
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select either the `chord-archive-grabber-1.2.0.xpi` file or `manifest.json` inside this folder.

### Option B — Permanent in Firefox Developer Edition / Nightly / ESR
1. In `about:config`, set `xpinstall.signatures.required` to `false`.
2. Drag `chord-archive-grabber-1.2.0.xpi` into Firefox.
3. Firefox prompts to install — click **Add**.

### Option C — Permanent in regular Firefox (signed)
Submit the `.xpi` to [addons.mozilla.org](https://addons.mozilla.org/developers/) for
signing. Free; requires a Mozilla account. Can list it as "self-distribution" only
if you don't want it public.

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
