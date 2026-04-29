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
      title: result.title || "",
      artist: result.artist || "",
      lyrics: result.lyrics,
      sourceUrl: tab.url || "",
    }))));
    const targetUrl = ARCHIVE_URL + "#new=" + payload;

    if (targetUrl.length > 500000) {
      // Massive chart — fallback to clipboard so we don't blow URL limits
      let out = "";
      if (result.title)  out += "{title: "  + result.title.replace(/[{}]/g, "") + "}\n";
      if (result.artist) out += "{artist: " + result.artist.replace(/[{}]/g, "") + "}\n";
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

// ---------- Page-context scraper ----------
function scrapePage() {
  function ugToChordPro(s) {
    return s.replace(/\[ch\]([^\[]+)\[\/ch\]/g, (_, c) => "[" + c.trim() + "]")
            .replace(/\[\/?tab\]/g, "");
  }
  let lyrics = "", title = "", artist = "";
  const host = location.hostname;

  if (/ultimate-guitar\.com/.test(host)) {
    const store = document.querySelector(".js-store");
    if (store && store.dataset && store.dataset.content) {
      try {
        const data = JSON.parse(store.dataset.content);
        const root = data?.store?.page?.data || {};
        const tab = root?.tab_view?.wiki_tab?.content
                 || root?.tab?.wiki_tab?.content;
        if (tab) lyrics = ugToChordPro(tab);
        // Try every artist field UG has used over the years
        const candidates = [
          root?.tab?.artist_name,
          root?.tab?.artist,
          root?.tab_view?.versions?.[0]?.artist_name,
          root?.tab_view?.meta?.artist,
          root?.tab_view?.song?.artist_name,
          root?.tab?.tab?.artist_name,
        ];
        artist = candidates.find(c => typeof c === "string" && c.trim()) || "";
        const titleCandidates = [
          root?.tab?.song_name,
          root?.tab?.title,
          root?.tab_view?.versions?.[0]?.song_name,
          root?.tab_view?.song?.title,
        ];
        title = titleCandidates.find(c => typeof c === "string" && c.trim()) || "";
      } catch (e) { /* fall through */ }
    }
    // Fallback: parse og:title meta tag (UG format: "Sail to the Moon Chords by Radiohead @ Ultimate-Guitar.com")
    if (!artist) {
      const og = document.querySelector('meta[property="og:title"]');
      if (og) {
        const t = og.getAttribute("content") || "";
        const m = t.match(/^(.+?)\s+(?:Chords|Tab|Bass|Ukulele|Drum|Guitar Pro|Power\s*Tab|Lyrics)?\s*(?:by|–|—|-)\s+([^|@\-–—]+?)(?:\s*[\|@\-–—].*)?$/i);
        if (m) {
          if (!title) title = m[1].trim();
          artist = m[2].trim();
        }
      }
    }
    // Last-ditch fallback: <meta itemprop="byArtist">
    if (!artist) {
      const ba = document.querySelector('[itemprop="byArtist"]');
      if (ba) artist = (ba.textContent || ba.getAttribute("content") || "").trim();
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
