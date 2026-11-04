// Shown first, in this order, to every user.
export const PIN_IDS = ["tirth:vr:163", "tirth:vr:161"];
export const PIN_KIND = "vr360";
// End of 15 Nov 2026 IST (20 days from 27 Oct).
export const PIN_UNTIL = Date.parse("2026-11-15T18:29:59.000Z");

// Bhakti TV (flat2d): lead with these series, never return these single videos.
export const FLAT2D_PIN_IDS = ["bhakti:2d:series:03", "bhakti:2d:series:04"];
export const FLAT2D_KIND = "flat2d";
export const FLAT2D_HIDE_IDS = ["bhakti:2d:video:033", "bhakti:2d:video:034"];

/**
 * Released app builds (<= 5.4.1) drop every 2D series/episode hit (premium-layout
 * approves episode ids, the app checks the series id) and rank only standalone
 * videos. Its Explore "Bhakti TV" rail shows the ranked videos first, then fills
 * to 12 from the layout order: Shiv Puran, KL2, Hanuman Charit, Krishna
 * Leelayein, Durga Saptshati, Dashavatar, then 033, 034, ... Returning exactly
 * six visible standalone videos fills the rail through Dashavatar and stops
 * before the two single videos. The same six go to every user on both
 * /latest and /recommend because the app merges the two lists.
 */
export const FLAT2D_APP_VIDEO_SLOTS = 6;

function idOf(hit) {
  return hit?.itemId || hit?.id;
}

function isSeriesOrEpisode(id) {
  return /^bhakti:2d:(series|ep):/.test(String(id || ""));
}

function seriesKey(id) {
  const m = String(id || "").match(/^bhakti:2d:(?:series|ep):(\d+)/);
  return m ? `bhakti:2d:series:${m[1]}` : String(id || "");
}

/** First `slots` standalone 2D videos the app will accept, in the given order. */
export function pickFlat2dVideos(hits, visibleIds, slots = FLAT2D_APP_VIDEO_SLOTS) {
  const out = [];
  const seen = new Set();
  for (const hit of hits || []) {
    const id = idOf(hit);
    if (!String(id || "").startsWith("bhakti:2d:video:")) continue;
    if (FLAT2D_HIDE_IDS.includes(id) || seen.has(id)) continue;
    if (visibleIds && !visibleIds.has(id)) continue;
    seen.add(id);
    out.push(hit);
    if (out.length >= slots) break;
  }
  return out;
}

function pinList(list, ids, kind) {
  const pinned = ids.map((id, i) => ({
    kind,
    id,
    itemId: id,
    score: Number.MAX_SAFE_INTEGER - i,
    pinned: true,
  }));
  const rest = list.filter((hit) => !ids.includes(idOf(hit)));
  return [...pinned, ...rest];
}

/** Series (pinned first, one hit per series) then the fixed video slots. */
export function shapeFlat2d(items, { videos } = {}) {
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  const series = [];
  for (const hit of pinList(list.filter((h) => isSeriesOrEpisode(idOf(h))), FLAT2D_PIN_IDS, FLAT2D_KIND)) {
    const key = seriesKey(idOf(hit));
    if (seen.has(key)) continue;
    seen.add(key);
    series.push(hit);
  }
  const vids = videos ?? pickFlat2dVideos(list, null);
  return [...series, ...vids];
}

export function pinFeatured(items, { category, n, now, videos } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const cap = (out) => (Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out);
  const cat = category ? String(category) : "";

  if (cat === FLAT2D_KIND) return cap(shapeFlat2d(list, { videos }));

  const capped = cap(list.slice());
  const at = Number(now);
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  return cap(pinList(capped, PIN_IDS, PIN_KIND));
}
