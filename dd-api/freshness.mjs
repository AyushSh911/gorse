export const IMPRESSION_TYPE = "impression";
export const FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;

export function parseFeedback(rows) {
  const watched = new Set();
  const impressions = new Map();
  for (const row of rows || []) {
    const type = row.FeedbackType || row.feedbackType;
    const itemId = row.ItemId || row.itemId;
    if (!type || !itemId) continue;
    if (type === "watch") watched.add(itemId);
    if (type === IMPRESSION_TYPE) {
      const t = Date.parse(row.Timestamp || row.timestamp || "");
      if (!Number.isFinite(t)) continue;
      const prev = impressions.get(itemId);
      if (prev == null || t < prev) impressions.set(itemId, t);
    }
  }
  return { watched, impressions };
}

export function swapQuota(n) {
  const count = Math.max(0, Number(n) || 0);
  if (count === 0) return 0;
  return Math.max(1, Math.min(3, Math.round(count / 4)));
}

export function windowEpoch(now, windowMs = FRESHNESS_MS) {
  return Math.floor(now / windowMs);
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fillerScore(profileId, epoch, itemId) {
  return hash32(`${profileId}|${epoch}|${itemId}`);
}

function isStale(impressions, itemId, now) {
  const t = impressions.get(itemId);
  if (t == null) return false;
  return now - t >= FRESHNESS_MS;
}

function withFlags(hit, watched, fresh) {
  return {
    ...hit,
    watched: watched.has(hit.itemId || hit.id),
    fresh: Boolean(fresh),
  };
}

function catalogHit(row, score = 0) {
  return {
    kind: row.kind,
    id: row.appId || row.ItemId,
    score,
    itemId: row.ItemId,
  };
}

export function applyFreshness({
  hits,
  catalog,
  profileId,
  watched,
  impressions,
  now,
}) {
  const list = Array.isArray(hits) ? hits : [];
  const used = new Set(list.map((h) => h.itemId || h.id).filter(Boolean));
  const epoch = windowEpoch(now);
  const quota = swapQuota(list.length);

  const fillers = [];
  if (impressions.size > 0 && quota > 0) {
    const eligible = [];
    for (const row of catalog || []) {
      const id = row.ItemId;
      if (!id || used.has(id)) continue;
      if (watched.has(id)) continue;
      const shown = impressions.get(id);
      if (shown != null && now - shown < FRESHNESS_MS) continue;
      eligible.push(row);
    }
    eligible.sort(
      (a, b) =>
        fillerScore(profileId, epoch, b.ItemId) - fillerScore(profileId, epoch, a.ItemId),
    );
    for (const row of eligible) {
      if (fillers.length >= quota) break;
      fillers.push(row);
    }
  }

  let fillerAt = 0;
  let remainingSwaps = fillers.length;
  const items = list.map((hit) => {
    const itemId = hit.itemId || hit.id;
    if (remainingSwaps > 0 && isStale(impressions, itemId, now) && fillerAt < fillers.length) {
      const row = fillers[fillerAt++];
      remainingSwaps -= 1;
      used.add(row.ItemId);
      return withFlags(catalogHit(row, hit.score), watched, true);
    }
    return withFlags(hit, watched, false);
  });

  const newImpressionIds = [];
  for (const hit of items) {
    const id = hit.itemId || hit.id;
    if (!id || impressions.has(id)) continue;
    newImpressionIds.push(id);
  }

  return { items, newImpressionIds, watchedIds: [...watched] };
}

export function impressionRows(profileId, itemIds, timestamp) {
  return (itemIds || []).map((ItemId) => ({
    FeedbackType: IMPRESSION_TYPE,
    UserId: profileId,
    ItemId,
    Value: 1,
    Timestamp: timestamp,
  }));
}

export function catalogPool(itemIndex, category) {
  const out = [];
  for (const [ItemId, meta] of itemIndex || []) {
    if (!ItemId || !meta) continue;
    if (category && meta.kind !== category) continue;
    out.push({ ItemId, kind: meta.kind, appId: meta.appId || ItemId });
  }
  return out;
}
