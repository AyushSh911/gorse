import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SKIP_IDS,
  kindFromShow,
  contentKindForShow,
  toGorseItemId,
} from "./ids.mjs";
import { buildLabels } from "./labels.mjs";
import { upsertItems, deleteItems } from "./gorse.mjs";
import { memoryGate } from "./memguard.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const JSONS_DIR = join(ROOT, "jsons");
const SOURCES_FILE = join(JSONS_DIR, "sources.json");

/** Live network sources (not snapshotted into jsons/). */
export const LIVE = {
  aarti: [
    "https://devgateway.techxrdev.in/api/content/open/aarti/temples",
    "https://gateway.techxr.co/api/content/open/aarti/temples",
  ],
  reelsMeta: "https://durlabhdarshan-shorts-2.firebaseio.com/meta.json",
  reelsBrandMeta: "https://durlabhdarshan-shorts-2.firebaseio.com/brandReelsMeta.json",
};

/** @deprecated Prefer LIVE + loadSource; kept for callers that still reference CDN. */
export const CDN = {
  ...LIVE,
  content: "local:content",
  layout: "local:layout",
  abhishek: "local:abhishek",
  home: "local:home",
  blogs: "local:blogs",
  live: "local:live",
};

const REEL_PER_CATEGORY = Number(process.env.REEL_PER_CATEGORY || 80);
const INDEX_FILE = join(ROOT, "item-index.json");

const LIVE_FALLBACK = [
  { id: "kashi-vishwanath", templeName: "Kashi Vishwanath", location: "Varanasi" },
  { id: "siddhivinayak", templeName: "Siddhivinayak", location: "Mumbai" },
];

let sourcesManifest = null;
const sourceCache = new Map();

async function getSources() {
  if (!sourcesManifest) {
    sourcesManifest = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  }
  return sourcesManifest;
}

/** Read a static catalog JSON from dd-api/jsons/ (source of truth). */
export async function loadSource(key) {
  if (sourceCache.has(key)) return sourceCache.get(key);
  const sources = await getSources();
  const entry = sources[key];
  if (!entry?.file) throw new Error(`unknown local source: ${key}`);
  const path = join(JSONS_DIR, entry.file);
  const data = JSON.parse(await readFile(path, "utf8"));
  sourceCache.set(key, data);
  return data;
}

function clearSourceCache() {
  sourceCache.clear();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function titleEn(title) {
  if (!title) return "";
  if (typeof title === "string") return title;
  return title.en || title.hi || "";
}

function locEn(location) {
  if (!location) return "";
  if (typeof location === "string") return location;
  return location.en || location.hi || "";
}

/** Recency so Gorse /api/latest is not dominated by last-ingested kind (sadhana). */
export function timestampForItem(itemId, kind) {
  const id = String(itemId || "");
  const vr = id.match(/tirth:vr:(\d+)/);
  if (vr) return new Date(Date.UTC(2026, 0, Number(vr[1]) || 1)).toISOString();
  const ep = id.match(/:ep:[^:]+:(\d+)/);
  if (ep) return new Date(Date.UTC(2025, 6, Number(ep[1]) || 1)).toISOString();
  const rank = {
    live: "2025-12-01T00:00:00.000Z",
    aarti: "2025-11-15T00:00:00.000Z",
    temple: "2025-11-01T00:00:00.000Z",
    abhishek: "2025-10-01T00:00:00.000Z",
    theatre3d: "2025-09-01T00:00:00.000Z",
    flat2d: "2025-08-01T00:00:00.000Z",
    reel: "2025-07-01T00:00:00.000Z",
    blog: "2025-06-01T00:00:00.000Z",
    sadhana: "2024-06-01T00:00:00.000Z",
  };
  return rank[kind] || "2025-01-01T00:00:00.000Z";
}

export function parseLatestBuckets(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const out = [];
  for (const [key, val] of Object.entries(meta)) {
    if (!String(key).startsWith("latestBucket_")) continue;
    const cat = String(key).slice("latestBucket_".length);
    const bucket = Number.parseInt(String(val), 10);
    if (cat && Number.isFinite(bucket) && bucket >= 0) out.push({ cat, bucket });
  }
  return out;
}

function sanitizeLabels(labels) {
  const out = {};
  for (const [k, v] of Object.entries(labels || {})) {
    if (v == null) continue;
    if (typeof v === "boolean") {
      out[k] = v ? 1 : 0;
      continue;
    }
    if (typeof v === "string" || typeof v === "number") {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) {
      out[k] = v;
    }
  }
  return out;
}

function gorseItem({ itemId, kind, appId, title, categories, hidden, timestamp, labels }) {
  return {
    ItemId: itemId,
    IsHidden: Boolean(hidden),
    Categories: [...new Set(categories.filter(Boolean))],
    Timestamp: timestamp || timestampForItem(itemId, kind),
    Labels: sanitizeLabels(labels),
    Comment: title || appId,
  };
}

export function keepSet(layout) {
  const status = layout?.status || {};
  const approved = new Set(status.approvedShowIds || status.approvedVideoShowIds || []);
  const disactive = new Set(status.disactiveShowIds || status.disactiveVideoShowIds || []);
  const comingSoon = new Set([
    ...(status.comingSoonShowIds || []),
    ...(status.comingSoonVideoShowIds_3d || []),
    ...(status.comingSoonVideoShowIds_2d || []),
  ]);
  const keep = new Set();
  for (const id of approved) {
    if (!disactive.has(id) && !SKIP_IDS.has(id)) keep.add(id);
  }
  return { keep, disactive, comingSoon, approved };
}

export function fromShows(shows, keep, comingSoon) {
  const items = [];
  for (const show of shows || []) {
    const id = show.id;
    if (!id || SKIP_IDS.has(id)) continue;
    if (keep.size && !keep.has(id) && !comingSoon.has(id)) continue;
    const kind = kindFromShow(show);
    const contentKind = contentKindForShow(show);
    const namespace = show.namespace || (String(id).startsWith("tirth:") ? "tirth" : "bhakti");
    const title = titleEn(show.title);
    const labels = buildLabels({
      kind,
      appId: id,
      title,
      location: locEn(show.location),
      namespace,
      showKind: show.kind,
      contentKind,
      metaTags: show.metaTags || [],
      flags: show.flags || {},
      seriesId: show.seriesId || show.webseriesId || "",
      episodeIndex: show.episodeIndex,
    });
    items.push(
      gorseItem({
        itemId: id,
        kind,
        appId: id,
        title,
        categories: [kind, namespace, contentKind, show.kind].filter(Boolean),
        hidden: comingSoon.has(id),
        timestamp: undefined,
        labels,
      }),
    );
  }
  return items;
}

function fromSeries(webseries, keep) {
  const items = [];
  for (const ws of webseries || []) {
    const id = ws.id;
    if (!id) continue;
    const eps = ws.episodeShowIds || [];
    if (keep.size && !eps.some((e) => keep.has(e)) && !keep.has(id)) continue;
    const kind = ws.kind === "flat2d" ? "flat2d" : "theatre3d";
    const namespace = ws.namespace || "bhakti";
    const title = titleEn(ws.title);
    const labels = buildLabels({
      kind,
      appId: id,
      title,
      location: "",
      namespace,
      showKind: ws.kind,
      contentKind: "theatre-series",
      seriesId: id,
      extra: { is_series_parent: true, episode_show_ids: eps },
    });
    items.push(
      gorseItem({
        itemId: id,
        kind,
        appId: id,
        title,
        categories: [kind, namespace, "series"],
        hidden: false,
        labels,
      }),
    );
  }
  return items;
}

function fromAbhishek(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const appId = String(row.id || "").trim();
    const itemId = toGorseItemId("abhishek", appId);
    const title = appId;
    const labels = buildLabels({
      kind: "abhishek",
      appId,
      title,
      location: row.location || "",
      namespace: "tirth",
      showKind: "abhishek3d",
      contentKind: "abhishek",
      extra: { dbId: row.dbId },
    });
    return gorseItem({
      itemId,
      kind: "abhishek",
      appId,
      title,
      categories: ["abhishek", "tirth"],
      labels,
    });
  });
}

function homeRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.temples)) return raw.temples;
  if (Array.isArray(raw?.darshans)) return raw.darshans;
  return [];
}

function fromHomeDarshan(raw) {
  return homeRows(raw).map((row) => {
    const appId = String(row.id || row.templeId || "").trim();
    if (!appId) return null;
    const title = titleEn(row.templeName) || appId;
    const itemId = toGorseItemId("temple", appId);
    const labels = buildLabels({
      kind: "temple",
      appId,
      title,
      location: titleEn(row.cityName),
      namespace: "tirth",
      showKind: "aajKeDarshan",
      contentKind: "aaj-ke-darshan",
    });
    return gorseItem({
      itemId,
      kind: "temple",
      appId,
      title,
      categories: ["temple", "tirth"],
      labels,
    });
  }).filter(Boolean);
}

function fromLive(rows) {
  return rows.map((row) => {
    const appId = String(row.id || "").trim();
    if (!appId) return null;
    const title = titleEn(row.templeName) || row.templeNameEn || appId;
    const itemId = toGorseItemId("live", appId);
    const labels = buildLabels({
      kind: "live",
      appId,
      title,
      location: locEn(row.city) || row.location || "",
      namespace: "tirth",
      showKind: "liveDarshan",
      contentKind: "live-darshan",
    });
    return gorseItem({
      itemId,
      kind: "live",
      appId,
      title,
      categories: ["live", "tirth"],
      labels,
    });
  }).filter(Boolean);
}

function fromAarti(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const appId = String(row.id || "").trim();
    if (!appId) return null;
    const title = titleEn(row.name) || appId;
    const itemId = toGorseItemId("aarti", appId);
    const labels = buildLabels({
      kind: "aarti",
      appId,
      title,
      location: "",
      namespace: "tirth",
      showKind: "aarti",
      contentKind: "aarti",
      extra: { youtubeHandle: row.youtubeHandle || "" },
    });
    return gorseItem({
      itemId,
      kind: "aarti",
      appId,
      title,
      categories: ["aarti", "tirth"],
      labels,
    });
  }).filter(Boolean);
}

function fromBlogs(raw) {
  const cats = raw?.categories || [];
  const items = [];
  for (const cat of cats) {
    for (const blog of cat.blogs || []) {
      const appId = String(blog.Blog_ID || "").trim();
      if (!appId) continue;
      const title = titleEn(blog.Blog_Title) || appId;
      const itemId = toGorseItemId("blog", appId);
      const labels = buildLabels({
        kind: "blog",
        appId,
        title,
        location: "",
        namespace: "bhakti",
        showKind: "blog",
        contentKind: "blog",
        extra: { blogCategoryID: cat.blogCategoryID },
      });
      items.push(
        gorseItem({
          itemId,
          kind: "blog",
          appId,
          title,
          categories: ["blog", "bhakti", cat.blogCategoryID],
          labels,
        }),
      );
    }
  }
  return items;
}

/** Exported for unit tests — maps Blog.json categories → Gorse blog items. */
export { fromBlogs };

async function fromReels() {
  const meta = await fetchJson(LIVE.reelsMeta);
  const cats = parseLatestBuckets(meta);
  try {
    const brand = await fetchJson(LIVE.reelsBrandMeta);
    const bucket = Number.parseInt(String(brand?.latestBucket), 10);
    if (Number.isFinite(bucket) && bucket >= 0 && brand?.enabled !== false) {
      cats.unshift({ cat: "BrandReels", bucket });
    }
  } catch {
    /* optional */
  }
  const items = [];
  const seen = new Set();
  for (const { cat, bucket } of cats) {
    try {
      const buckets = await fetchJson(
        `https://durlabhdarshan-shorts-2.firebaseio.com/${encodeURIComponent(cat)}/buckets/${bucket}.json`,
      );
      const entries =
        buckets && typeof buckets === "object" && !Array.isArray(buckets)
          ? Object.entries(buckets)
          : [];
      for (const [firebaseKey, dto] of entries.slice(0, REEL_PER_CATEGORY)) {
        if (!firebaseKey || seen.has(firebaseKey)) continue;
        seen.add(firebaseKey);
        const title = dto?.title || firebaseKey;
        const itemId = toGorseItemId("reel", firebaseKey);
        const labels = buildLabels({
          kind: "reel",
          appId: firebaseKey,
          title,
          namespace: "bhakti",
          showKind: "reel",
          contentKind: "reel",
          extra: { reel_category: cat, reel_bucket: bucket },
        });
        items.push(
          gorseItem({
            itemId,
            kind: "reel",
            appId: firebaseKey,
            title,
            categories: ["reel", "bhakti", cat],
            labels,
          }),
        );
      }
    } catch {
      /* skip category */
    }
  }
  return items;
}

async function fetchAartiRows() {
  for (const url of LIVE.aarti) {
    try {
      const data = await fetchJson(url);
      if (Array.isArray(data) && data.length) return data;
    } catch {
      /* try next */
    }
  }
  return [];
}

async function fetchLiveRows() {
  try {
    const raw = await loadSource("live");
    const rows = Array.isArray(raw?.schedule) ? raw.schedule : Array.isArray(raw) ? raw : [];
    if (rows.length) return rows;
  } catch {
    /* fallback */
  }
  return LIVE_FALLBACK;
}

async function fromSadhana() {
  const rows = await loadSource("sadhana");
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const itemId = toGorseItemId("sadhana", row.id);
    const labels = buildLabels({
      kind: "sadhana",
      appId: row.id,
      title: row.title,
      namespace: "bhakti",
      showKind: "sadhana",
      contentKind: "sadhana",
      extra: { deityId: row.deityId, sadhana_category: row.category },
    });
    return gorseItem({
      itemId,
      kind: "sadhana",
      appId: row.id,
      title: row.title,
      categories: ["sadhana", "bhakti", row.category, row.deityId],
      labels,
    });
  });
}

/** gorse ItemId → { kind, appId, source } for BFF responses after sync */
export const itemIndex = new Map();

function remember(item, source) {
  itemIndex.set(item.ItemId, {
    kind: item.Labels?.kind,
    appId: item.Labels?.app_id || item.ItemId,
    source,
  });
}

export async function loadItemIndex() {
  try {
    const raw = JSON.parse(await readFile(INDEX_FILE, "utf8"));
    itemIndex.clear();
    for (const [k, v] of Object.entries(raw || {})) {
      if (k && v) itemIndex.set(k, v);
    }
    return itemIndex.size;
  } catch {
    return 0;
  }
}

async function saveItemIndex() {
  await writeFile(INDEX_FILE, JSON.stringify(Object.fromEntries(itemIndex)), "utf8");
}

/**
 * Diff old index vs newly built items per source.
 * Failed sources never contribute deletes (keeps previous ids).
 */
export function diffSourceIds(oldIndex, newItemsBySource, failedSources) {
  const failed = new Set(failedSources || []);
  const toDelete = [];
  const added = [];
  const updated = [];

  const oldBySource = new Map();
  for (const [id, meta] of oldIndex instanceof Map ? oldIndex : Object.entries(oldIndex || {})) {
    const src = meta?.source;
    if (!src) continue;
    if (!oldBySource.has(src)) oldBySource.set(src, new Set());
    oldBySource.get(src).add(id);
  }

  for (const [source, items] of Object.entries(newItemsBySource || {})) {
    if (failed.has(source)) continue;
    const newIds = new Set((items || []).map((i) => i.ItemId).filter(Boolean));
    const oldIds = oldBySource.get(source) || new Set();
    for (const id of newIds) {
      if (oldIds.has(id)) updated.push(id);
      else added.push(id);
    }
    for (const id of oldIds) {
      if (!newIds.has(id)) toDelete.push(id);
    }
  }

  return { toDelete, added, updated };
}

export async function buildCatalogItems() {
  clearSourceCache();
  const errors = [];
  const counts = {};
  const all = [];
  const itemsBySource = {};
  const failedSources = [];

  async function add(name, fn) {
    try {
      const items = await fn();
      itemsBySource[name] = items;
      all.push(...items);
      counts[name] = items.length;
    } catch (e) {
      failedSources.push(name);
      errors.push({ source: name, error: String(e.message || e) });
      counts[name] = 0;
    }
  }

  let premium = null;
  let keep = new Set();
  let comingSoon = new Set();
  try {
    premium = await loadSource("content");
    const layout = await loadSource("layout");
    ({ keep, comingSoon } = keepSet(layout));
    counts.keep = keep.size;
  } catch (e) {
    failedSources.push("shows", "series");
    errors.push({ source: "content/layout", error: String(e.message || e) });
    counts.keep = 0;
  }

  if (premium) {
    await add("shows", async () => fromShows(premium.shows, keep, comingSoon));
    await add("series", async () => fromSeries(premium.webseries, keep));
  }

  await add("abhishek", async () => fromAbhishek(await loadSource("abhishek")));
  await add("temple", async () => fromHomeDarshan(await loadSource("home")));
  await add("live", async () => fromLive(await fetchLiveRows()));
  await add("aarti", async () => fromAarti(await fetchAartiRows()));
  await add("blog", async () => fromBlogs(await loadSource("blogs")));
  await add("reel", fromReels);
  await add("sadhana", fromSadhana);

  const seen = new Set();
  const unique = [];
  for (const it of all) {
    if (!it.ItemId || seen.has(it.ItemId)) continue;
    seen.add(it.ItemId);
    unique.push(it);
  }
  return { items: unique, itemsBySource, failedSources, counts, errors };
}

function applyIndexMerge(oldIndex, itemsBySource, failedSources) {
  const failed = new Set(failedSources || []);
  itemIndex.clear();
  for (const [id, meta] of oldIndex) {
    if (meta?.source && failed.has(meta.source)) {
      itemIndex.set(id, meta);
    }
  }
  for (const [source, items] of Object.entries(itemsBySource || {})) {
    if (failed.has(source)) continue;
    for (const it of items || []) {
      if (!it?.ItemId) continue;
      remember(it, source);
    }
  }
}

export async function syncCatalog() {
  if (itemIndex.size === 0) await loadItemIndex();
  const oldIndex = new Map(itemIndex);

  await memoryGate("sync-build");
  const built = await buildCatalogItems();
  await memoryGate("sync-upsert");
  const upsert = await upsertItems(built.items);

  const { toDelete, added, updated } = diffSourceIds(
    oldIndex,
    built.itemsBySource,
    built.failedSources,
  );
  const deleted = await deleteItems(toDelete);

  applyIndexMerge(oldIndex, built.itemsBySource, built.failedSources);
  await saveItemIndex();

  return {
    ...built,
    upsert,
    delete: deleted,
    added: added.length,
    updated: updated.length,
    deleted: toDelete.length,
    itemCount: itemIndex.size,
  };
}
