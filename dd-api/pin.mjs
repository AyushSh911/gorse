// Shown first, in this order, to every user.
export const PIN_IDS = ["tirth:vr:163", "tirth:vr:161"];
export const PIN_KIND = "vr360";
// End of 15 Nov 2026 IST (20 days from 27 Oct).
export const PIN_UNTIL = Date.parse("2026-11-15T18:29:59.000Z");

// Bhakti TV (flat2d): lead with these series, never return these single videos.
export const FLAT2D_PIN_IDS = ["bhakti:2d:series:03", "bhakti:2d:series:04"];
export const FLAT2D_KIND = "flat2d";
export const FLAT2D_HIDE_IDS = ["bhakti:2d:video:033", "bhakti:2d:video:034"];

function pinList(list, ids, kind) {
  const pinned = ids.map((id, i) => ({
    kind,
    id,
    itemId: id,
    score: Number.MAX_SAFE_INTEGER - i,
    pinned: true,
  }));
  const rest = list.filter((hit) => !ids.includes(hit.itemId || hit.id));
  return [...pinned, ...rest];
}

export function pinFeatured(items, { category, n, now } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const cap = (out) => (Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out);
  const cat = category ? String(category) : "";

  if (cat === FLAT2D_KIND) {
    const visible = list.filter((hit) => !FLAT2D_HIDE_IDS.includes(hit.itemId || hit.id));
    return cap(pinList(visible, FLAT2D_PIN_IDS, FLAT2D_KIND));
  }

  const capped = cap(list.slice());
  const at = Number(now);
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  return cap(pinList(capped, PIN_IDS, PIN_KIND));
}
