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
 *   always put whatever Gorse ranks FIRST and drop series hits, so any single
 *   video Gorse returns would jump ahead of every series. For them no single
 *   videos are returned: their rails / rows fall back to the layout order
 *   (series first, singles last, exactly as the JSON lists them).
 *   shape=v2 builds get every JSON-visible id and put singles last themselves,
 *   in Gorse order.
 */
export function shapeFlat2d(items, plan, { legacy = true } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!plan?.visible?.size) return list;
  const seen = new Set();
  const out = [];
  for (const hit of list) {
    const id = String(idOf(hit) || "");
    const series = plan.seriesOf.get(id);
    const key = series || id;
    if (!plan.visible.has(id) && !(series && plan.visible.has(series))) continue;
    if (seen.has(key)) continue;
    if (legacy && !series && !id.startsWith("bhakti:2d:series:")) continue;
    seen.add(key);
    if (legacy) {
      const appId = legacySeriesId(key, plan);
      if (!appId) continue;
      out.push({ ...hit, id: appId, itemId: appId });
      continue;
    }
    out.push(hit);
  }
  return out;
}

/**
 * Released app builds drop every `bhakti:2d:series:N` / `bhakti:2d:ep:N:E` hit
 * (they check the series id, which premium-layout never approves) and keep
 * their old cached order whenever the list comes back empty. They do accept the
 * legacy v1 id `bhakti:2d:show:N:EEE`: it aliases to the approved v2 episode
 * `bhakti:2d:ep:NN:EEE` and maps back to series N for ranking. So legacy flat2d
 * responses name each series by one of its JSON-approved episodes in v1 form.
 */
export function legacySeriesId(seriesId, plan) {
  const m = String(seriesId || "").match(/^bhakti:2d:series:(\d+)$/);
  if (!m) return null;
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
