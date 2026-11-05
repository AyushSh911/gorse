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
 * - `legacy` = app builds that do not send shape=v2 (<= 5.4.1). Those builds
 *   discard series hits and pad their Bhakti TV rail from the layout Darshan TV
 *   list, so any standalone video Gorse returns becomes an extra card. For them
 *   standalone videos are limited to the ones the layout lists on that rail
 *   (`plan.railShows`): the rail then equals the layout list, Gorse-ordered.
 */
export function shapeFlat2d(items, plan, { legacy = true } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!plan?.visible?.size) return list;
  const rail = new Set(plan.railShows || []);
  const seen = new Set();
  const out = [];
  for (const hit of list) {
    const id = String(idOf(hit) || "");
    const series = plan.seriesOf.get(id);
    const key = series || id;
    if (!plan.visible.has(id) && !(series && plan.visible.has(series))) continue;
    if (seen.has(key)) continue;
    if (legacy && !series && id.startsWith("bhakti:2d:video:") && !rail.has(id)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
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
