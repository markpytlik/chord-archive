// Cross-browser API: Firefox uses `browser`, Chrome uses `chrome`. The `chrome` namespace works in both.
const api = (typeof browser !== "undefined") ? browser : chrome;
const ARCHIVE_URL = "https://songs.markpytlik.com/";

const $ = (id) => document.getElementById(id);
function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status show " + kind;
}

async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function init() {
  // Show actual extension version from manifest (no hardcoding)
  try {
    const manifest = api.runtime.getManifest();
    const v = $("version");
    if (v) v.textContent = manifest.version;
  } catch (e) {}

  const tab = await getActiveTab();
  const url = tab?.url || "";
  let host = "(no page)";
  try { host = new URL(url).hostname; } catch (e) {}
  $("hostname").textContent = host;
  if (!/^https?:/.test(url)) {
    $("grab").disabled = true;
    setStatus("Grab only works on regular web pages. Open a chord page first.", "err");
  }
}
init();

$("open").addEventListener("click", async () => {
  api.tabs.create({ url: ARCHIVE_URL });
});

$("grab").addEventListener("click", async () => {
  const btn = $("grab");
  btn.disabled = true;
  setStatus("Scraping page…", "busy");
  try {
    const tab = await getActiveTab();
    const results = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    const result = results?.[0]?.result;
    if (!result || !result.lyrics) {
      setStatus("No chord chart found on this page.", "err");
      btn.disabled = false;
      return;
    }
    // Build payload, base64-encode, redirect to Chord Archive's #new= URL.
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
      title: cleanScrapedTitle(result.title || ""),
      artist: cleanScrapedTitle(result.artist || ""),
      lyrics: result.lyrics,
      sourceUrl: tab.url || "",
    }))));
    const targetUrl = ARCHIVE_URL + "#new=" + payload;

    if (targetUrl.length > 500000) {
      // Massive chart — fallback to clipboard so we don't blow URL limits
      let out = "";
      const cleanTitle = cleanScrapedTitle(result.title || "");
      const cleanArtist = cleanScrapedTitle(result.artist || "");
      if (cleanTitle)  out += "{title: "  + cleanTitle.replace(/[{}]/g, "") + "}\n";
      if (cleanArtist) out += "{artist: " + cleanArtist.replace(/[{}]/g, "") + "}\n";
      out += "\n" + result.lyrics;
      await navigator.clipboard.writeText(out);
      setStatus("Chart was too large for direct import. Copied to clipboard — paste into the lyrics field.", "ok");
      api.tabs.create({ url: ARCHIVE_URL });
      return;
    }

    const charCount = result.lyrics.length;
    setStatus("Got it — opening Chord Archive with " + charCount + " chars pre-filled.", "ok");
    setTimeout(() => api.tabs.create({ url: targetUrl }), 200);
  } catch (e) {
    setStatus("Error: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// Strip "(chords)" / "(tab)" / etc. trailing noise from a song title
function cleanScrapedTitle(t) {
  if (!t) return t;
  let out = t;
  // Strip common parenthetical/bracketed type tags that may repeat ("Foo (Chords) (Tab)")
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\s*[\(\[]\s*(?:chords?|tabs?|lyrics?|guitar\s*pro|gp|bass|ukulele|drum|power\s*tab|piano|keyboard|chord\s*pro)\s*[\)\]]\s*$/i, "");
  }
  // Strip bare trailing words too ("Foo Chords")
  out = out.replace(/\s+(?:chords?|tabs?|lyrics?|tablature)\s*$/i, "");
  return out.trim();
}

// ---------- Page-context scraper ----------
function scrapePage() {
  // Recursive search of the embedded JSON for any key matching a regex.
  function deepFindKey(obj, keyPattern, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== "object") return null;
    for (const k of Object.keys(obj)) {
      if (keyPattern.test(k)) {
        const v = obj[k];
        if (typeof v === "string" && v.trim() && v.length < 200) return v.trim();
      }
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object") {
        const found = deepFindKey(v, keyPattern, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  function ugToChordPro(s) {
    return s.replace(/\[ch\]([^\[]+)\[\/ch\]/g, (_, c) => "[" + c.trim() + "]")
            .replace(/\[\/?tab\]/g, "");
  }
  let lyrics = "", title = "", artist = "";
  const host = location.hostname;

  if (/ultimate-guitar\.com/.test(host)) {
    // STEP 1 — og:title is the most reliable source for title vs artist on UG.
    // Format: "Sail To The Moon CHORDS by Radiohead @ Ultimate-Guitar.com"
    const og = document.querySelector('meta[property="og:title"]');
    if (og) {
      const t = og.getAttribute("content") || "";
      const m = t.match(/^(.+?)\s+(?:Chords|Chord|Tab|Tabs|Bass|Ukulele|Drum|Guitar Pro|Power\s*Tab|Lyrics|Pro)\s+(?:by|–|—|-)\s+([^|@\-–—]+?)(?:\s*[\|@\-–—].*)?$/i);
      if (m) {
        title = m[1].trim();
        artist = m[2].trim();
      }
    }
    // STEP 2 — pull lyrics from the embedded JSON (only place they live)
    const store = document.querySelector(".js-store");
    if (store && store.dataset && store.dataset.content) {
      try {
        const data = JSON.parse(store.dataset.content);
        const root = data?.store?.page?.data || {};
        const tabContent = root?.tab_view?.wiki_tab?.content
                        || root?.tab?.wiki_tab?.content;
        if (tabContent) lyrics = ugToChordPro(tabContent);
        // Only use JSON for title/artist if og:title didn't yield them
        if (!artist) {
          const cand = [
            root?.tab?.artist_name,
            root?.tab?.artist,
            root?.tab_view?.versions?.[0]?.artist_name,
            root?.tab_view?.meta?.artist,
            root?.tab_view?.song?.artist_name,
          ].find(c => typeof c === "string" && c.trim());
          if (cand) artist = cand;
        }
        if (!title) {
          const cand = [
            root?.tab?.song_name,
            root?.tab?.title,
            root?.tab_view?.versions?.[0]?.song_name,
            root?.tab_view?.song?.title,
          ].find(c => typeof c === "string" && c.trim());
          if (cand) title = cand;
        }
      } catch (e) { /* fall through */ }
    }
    // STEP 3 — recursive deep-find on the JSON if known paths missed
    if ((!artist || !title) && store && store.dataset && store.dataset.content) {
      try {
        const data = JSON.parse(store.dataset.content);
        if (!artist) {
          artist = deepFindKey(data, /^(artist_name|artist|band|musician|performer|song_band|byArtist)$/i) || "";
        }
        if (!title) {
          title = deepFindKey(data, /^(song_name|song_title|title|name|track_name)$/i) || "";
        }
      } catch (e) {}
    }
    // STEP 4 — last ditch: <meta itemprop="byArtist"> or microdata
    if (!artist) {
      const ba = document.querySelector('[itemprop="byArtist"]');
      if (ba) artist = (ba.textContent || ba.getAttribute("content") || "").trim();
    }
    if (!artist) {
      const ba2 = document.querySelector('[itemprop="performer"]') || document.querySelector('[itemprop="creator"]');
      if (ba2) artist = (ba2.textContent || ba2.getAttribute("content") || "").trim();
    }
    // STEP 5 — UG often has <h1> with "Song Title CHORDS" plus a sibling artist link
    if (!artist) {
      const h1 = document.querySelector("h1");
      if (h1 && h1.parentElement) {
        const a = h1.parentElement.querySelector('a[href*="/tab/"]');
        if (a) artist = a.textContent.trim();
      }
    }
  }
  if (!lyrics && /e-chords\.com/.test(host)) {
    const pre = document.querySelector("pre#core") || document.querySelector("pre");
    if (pre) lyrics = ugToChordPro(pre.textContent);
  }
  if (!lyrics && /chordie\.com/.test(host)) {
    const pre = document.querySelector("pre");
    if (pre) lyrics = pre.textContent;
  }
  if (!lyrics) {
    const pres = [...document.querySelectorAll("pre")]
      .filter(p => p.textContent.length > 100)
      .sort((a, b) => b.textContent.length - a.textContent.length);
    if (pres[0]) lyrics = pres[0].textContent;
  }
  if (!title) {
    const h1 = document.querySelector("h1");
    title = h1?.textContent?.trim() || document.title.replace(/\s*[\|@\-–—].*/, "").trim();
  }
  return { lyrics, title, artist, host };
}
