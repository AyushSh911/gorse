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
 * Bhakti TV (flat2d). premium-layout / premium-content decide WHAT is shown;
 * Gorse only decides the ORDER. No ids or counts are hard-coded here.
 *
 * - Drop any hit the JSON does not make visible (approved, not disactive, not
 *   coming soon). Episode hits collapse onto their series; one hit per series.
 * - Order is always: every series first, then single videos at the bottom,
 *   Gorse order inside each group. Nothing JSON-visible is dropped (v2).
 * - `legacy` = app builds that do not send shape=v2 (<= 5.4.1). Those builds
 *   put every ranked single in front of all series and cannot resolve any
 *   series id, so singles are omitted for them: their Bhakti TV rail then uses
 *   the layout order, which lists series first and singles after. Series are
 *   sent as v1 episode ids (legacySeriesId) so the list is never empty and the
 *   app replaces any stale cached order.
 */
export function shapeFlat2d(items, plan, { legacy = true } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!plan?.visible?.size) return list;
  const seen = new Set();
  const seriesHits = [];
  const singles = [];
  for (const hit of list) {
    const id = String(idOf(hit) || "");
    const series = plan.seriesOf.get(id) || (id.startsWith("bhakti:2d:series:") ? id : null);
    const key = series || id;
    if (!plan.visible.has(id) && !(series && plan.visible.has(series))) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!series) {
      // Released builds put any ranked single FIRST; omit singles for them so
      // their rails fall back to layout order (series first, singles after).
      if (!legacy) singles.push(hit);
      continue;
    }
    if (legacy) {
      const appId = legacySeriesId(key, plan);
      if (!appId) continue;
      seriesHits.push({ ...hit, id: appId, itemId: appId });
      continue;
    }
    seriesHits.push(hit);
  }
  // Series first, single videos at the bottom; Gorse order inside each group.
  return [...seriesHits, ...singles];
}

/**
 * v1 alias of a series' first JSON-approved episode (`bhakti:2d:show:N:EEE`).
 * Builds <= 5.4.1 accept it through their approval filter (alias of an
 * approved v2 episode), so their cached Gorse list is refreshed instead of
 * keeping an old order. It does not let those builds rank series.
 */
export function legacySeriesId(seriesId, plan) {
  const m = String(seriesId || "").match(/^bhakti:2d:series:(\d+)$/);
  if (!m) return null;
  // Layout approves the series id itself: released builds accept it and can
  // rank the series row with it (JSON-controlled switch).
  if (plan.approvedSeries?.has(seriesId)) return seriesId;
  const nn = String(Number(m[1])).padStart(2, "0");
  const ep = [...plan.visible].filter((x) => x.startsWith(`bhakti:2d:ep:${nn}:`)).sort()[0];
  const e = ep && ep.match(/^bhakti:2d:ep:(\d+):(\d+)$/);
  return e ? `bhakti:2d:show:${Number(e[1])}:${e[2]}` : null;
}

export function pinFeatured(items, { category, n, now, flat2dPlan, legacy } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const cap = (out) => (Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out);
  const cat = category ? String(category) : "";

  if (cat === FLAT2D_KIND) {
    return cap(shapeFlat2d(list, flat2dPlan, { legacy }));
  }

  const capped = cap(list.slice());
  const at = Number(now);
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  return cap(pinList(capped, PIN_IDS, PIN_KIND));
}
