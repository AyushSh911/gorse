export const PIN_ID = "tirth:vr:161";
export const PIN_KIND = "vr360";
// End of 25 Oct 2026 IST (10 days from 15 Oct).
export const PIN_UNTIL = Date.parse("2026-10-25T18:29:59.000Z");

export function pinFeatured(items, { category, n, now } = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Number(n);
  const capped = Number.isFinite(limit) && limit > 0 ? list.slice(0, limit) : list.slice();
  const at = Number(now);
  const cat = category ? String(category) : "";
  if (!Number.isFinite(at) || at > PIN_UNTIL) return capped;
  if (cat && cat !== PIN_KIND) return capped;
  const pinned = {
    kind: PIN_KIND,
    id: PIN_ID,
    itemId: PIN_ID,
    score: Number.MAX_SAFE_INTEGER,
    pinned: true,
  };
  const rest = capped.filter((hit) => (hit.itemId || hit.id) !== PIN_ID);
  const out = [pinned, ...rest];
  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out;
}
