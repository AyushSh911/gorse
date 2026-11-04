// Shown first, in this order, to every user.
export const PIN_IDS = ["tirth:vr:163", "tirth:vr:161"];
export const PIN_KIND = "vr360";
// End of 15 Nov 2026 IST (20 days from 27 Oct).
export const PIN_UNTIL = Date.parse("2026-11-15T18:29:59.000Z");

export const FLAT2D_KIND = "flat2d";

function idOf(hit) {
  return hit?.itemId || hit?.id;
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

/**
 * Bhakti TV (flat2d). Visibility is owned by premium-layout / premium-content;
 * Gorse only orders. No ids are hard-coded here.
 *
 * - Every hit must be a layout-visible flat2d id (series id, episode id, or
 *   standalone video) per `plan.visible`. Anything else is dropped.
 * - One hit per series (episode hits collapse onto their series).
 * - `legacy` (app builds that do not send shape=v2, i.e. <= 5.4.1): those builds
 *   drop series hits and fill their Bhakti TV rail to 12 from the layout's
 *   Darshan TV list after the ranked standalone videos. Cap standalone videos at
 *   `plan.legacyVideoSlots` (= 12 - layout-listed rail shows) so ranking can
 *   never push a layout-listed show off that rail. Those builds merge
 *   /recommend with /latest, so both draw videos from one shared
 *   `legacyVideoIds` set (the newest visible videos); Gorse still orders them.
 */
export function shapeFlat2d(items, plan, { legacy = true, legacyVideoIds } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!plan?.visible?.size) return list;
  const seen = new Set();
  const out = [];
  let videos = 0;
  for (const hit of list) {
    const id = String(idOf(hit) || "");
    const series = plan.seriesOf.get(id);
    const key = series || id;
    if (!plan.visible.has(id) && !(series && plan.visible.has(series))) continue;
    if (seen.has(key)) continue;
    const isVideo = !series && id.startsWith("bhakti:2d:video:");
    if (legacy && isVideo) {
      if (legacyVideoIds && !legacyVideoIds.has(id)) continue;
      if (videos >= plan.legacyVideoSlots) continue;
      videos += 1;
    }
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/** Newest `plan.legacyVideoSlots` visible standalone videos from a latest list. */
export function legacyVideoSet(latestHits, plan) {
  const out = new Set();
  if (!plan) return out;
  for (const hit of latestHits || []) {
    if (out.size >= plan.legacyVideoSlots) break;
    const id = String(idOf(hit) || "");
    if (!id.startsWith("bhakti:2d:video:") || plan.seriesOf.has(id)) continue;
    if (plan.visible.has(id)) out.add(id);
  }
  return out;
}

export function pinFeatured(items, { category, n, now, flat2dPlan, legacy, legacyVideoIds } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const cap = (out) => (Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out);
  const cat = category ? String(category) : "";

  if (cat === FLAT2D_KIND) {
    return cap(shapeFlat2d(list, flat2dPlan, { legacy, legacyVideoIds }));
  }

  const capped = cap(list.slice());
  const at = Number(now);
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  return cap(pinList(capped, PIN_IDS, PIN_KIND));
}
