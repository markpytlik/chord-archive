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
  const tab = await getActiveTab();
  const url = tab?.url || "";
  let host = "(no page)";
  try { host = new URL(url).hostname; } catch (e) {}
  $("hostname").textContent = host;

  // Disable Grab button on chrome:// or extension pages
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
    // Inject and run the scraper in the page context
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
    // Build ChordPro output and copy
    let out = "";
    if (result.title)  out += "{title: "  + result.title.replace(/[{}]/g, "") + "}\n";
    if (result.artist) out += "{artist: " + result.artist.replace(/[{}]/g, "") + "}\n";
    out += "\n" + result.lyrics;

    await navigator.clipboard.writeText(out);
    const charCount = result.lyrics.length;
    setStatus("Copied! " + charCount + " chars on your clipboard. Paste into Chord Archive's lyrics field, then click 'Parse pasted sheet'.", "ok");

    if ($("autoOpen").checked) {
      setTimeout(() => api.tabs.create({ url: ARCHIVE_URL }), 600);
    }
  } catch (e) {
    setStatus("Error: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------- Page-context scraper ----------
// This function is serialized and injected into the active tab. It only sees
// the page DOM, not extension globals.
function scrapePage() {
  function ugToChordPro(s) {
    return s.replace(/\[ch\]([^\[]+)\[\/ch\]/g, (_, c) => "[" + c.trim() + "]")
            .replace(/\[\/?tab\]/g, "");
  }

  let lyrics = "", title = "", artist = "";
  const host = location.hostname;

  // Ultimate Guitar
  if (/ultimate-guitar\.com/.test(host)) {
    const store = document.querySelector(".js-store");
    if (store && store.dataset && store.dataset.content) {
      try {
        const data = JSON.parse(store.dataset.content);
        const tab = data?.store?.page?.data?.tab_view?.wiki_tab?.content
                 || data?.store?.page?.data?.tab?.wiki_tab?.content;
        const meta = data?.store?.page?.data?.tab;
        if (tab) {
          lyrics = ugToChordPro(tab);
          title = meta?.song_name || "";
          artist = meta?.artist_name || "";
        }
      } catch (e) { /* fall through to <pre> */ }
    }
  }

  // E-chords
  if (!lyrics && /e-chords\.com/.test(host)) {
    const pre = document.querySelector("pre#core") || document.querySelector("pre");
    if (pre) lyrics = ugToChordPro(pre.textContent);
  }

  // Chordie
  if (!lyrics && /chordie\.com/.test(host)) {
    const pre = document.querySelector("pre");
    if (pre) lyrics = pre.textContent;
  }

  // Generic fallback: largest <pre> that looks like a chord chart
  if (!lyrics) {
    const pres = [...document.querySelectorAll("pre")]
      .filter(p => p.textContent.length > 100)
      .sort((a, b) => b.textContent.length - a.textContent.length);
    if (pres[0]) lyrics = pres[0].textContent;
  }

  // Title fallback
  if (!title) {
    const h1 = document.querySelector("h1");
    title = h1?.textContent?.trim() || document.title.replace(/\s*[\|@\-–—].*/, "").trim();
  }

  return { lyrics, title, artist, host };
}
