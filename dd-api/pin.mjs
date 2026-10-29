// Shown first, in this order, to every user.
export const PIN_IDS = ["tirth:vr:163", "tirth:vr:161"];
export const PIN_KIND = "vr360";
// End of 15 Nov 2026 IST (20 days from 27 Oct).
export const PIN_UNTIL = Date.parse("2026-11-15T18:29:59.000Z");

export function pinFeatured(items, { category, n, now } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const capped = Number.isFinite(limit) && limit > 0 ? list.slice(0, limit) : list.slice();
  const at = Number(now);
  const cat = category ? String(category) : "";
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  const pinned = PIN_IDS.map((id, i) => ({
    kind: PIN_KIND,
    id,
    itemId: id,
    score: Number.MAX_SAFE_INTEGER - i,
    pinned: true,
  }));
  const rest = capped.filter((hit) => !PIN_IDS.includes(hit.itemId || hit.id));
  const out = [...pinned, ...rest];
  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out;
}
