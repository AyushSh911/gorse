export const SKIP_IDS = new Set(["tirth:vr:160"]);

export const KINDS = [
  "vr360",
  "theatre3d",
  "flat2d",
  "abhishek",
  "temple",
  "live",
  "aarti",
  "blog",
  "reel",
  "sadhana",
];

export function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

export function encodeItemPath(itemId) {
  return encodeURIComponent(itemId);
}

/** Map app {kind,id} → Gorse ItemId. Premium ids are already namespaced. */
export function toGorseItemId(kind, id) {
  const raw = String(id || "").trim();
  if (!raw) return "";
  if (
    raw.startsWith("tirth:vr:") ||
    raw.startsWith("bhakti:3d:") ||
    raw.startsWith("bhakti:2d:") ||
    raw.startsWith("abhishek:3d:") ||
    raw.startsWith("aaj:darshan:") ||
    raw.startsWith("live:") ||
    raw.startsWith("aarti:") ||
    raw.startsWith("blog:") ||
    raw.startsWith("reel:") ||
    raw.startsWith("sadhana:")
  ) {
    return raw;
  }
  switch (kind) {
    case "vr360":
    case "theatre3d":
    case "flat2d":
      return raw;
    case "abhishek":
      return `abhishek:3d:${slugify(raw)}`;
    case "temple":
      return `aaj:darshan:${slugify(raw)}`;
    case "live":
      return `live:${raw}`;
    case "aarti":
      return `aarti:${raw}`;
    case "blog":
      return `blog:${raw}`;
    case "reel":
      return `reel:${raw}`;
    case "sadhana":
      return `sadhana:${raw}`;
    default:
      return raw;
  }
}

export function kindFromGorseItemId(itemId) {
  if (itemId.startsWith("tirth:vr:")) return "vr360";
  if (itemId.startsWith("bhakti:3d:")) return "theatre3d";
  if (itemId.startsWith("bhakti:2d:")) return "flat2d";
  if (itemId.startsWith("abhishek:3d:")) return "abhishek";
  if (itemId.startsWith("aaj:darshan:")) return "temple";
  if (itemId.startsWith("live:")) return "live";
  if (itemId.startsWith("aarti:")) return "aarti";
  if (itemId.startsWith("blog:")) return "blog";
  if (itemId.startsWith("reel:")) return "reel";
  if (itemId.startsWith("sadhana:")) return "sadhana";
  return null;
}

export function appIdFromGorseItemId(itemId, labels = {}) {
  if (labels && labels.app_id) return String(labels.app_id);
  const kind = kindFromGorseItemId(itemId);
  if (!kind) return itemId;
  if (kind === "vr360" || kind === "theatre3d" || kind === "flat2d") return itemId;
  const prefixes = {
    abhishek: "abhishek:3d:",
    temple: "aaj:darshan:",
    live: "live:",
    aarti: "aarti:",
    blog: "blog:",
    reel: "reel:",
    sadhana: "sadhana:",
  };
  const p = prefixes[kind];
  return p && itemId.startsWith(p) ? itemId.slice(p.length) : itemId;
}

export function kindFromShow(show) {
  if (show?.kind === "vr360") return "vr360";
  if (show?.kind === "theatre3d") return "theatre3d";
  if (show?.kind === "flat2d") return "flat2d";
  if (String(show?.id || "").startsWith("tirth:vr:")) return "vr360";
  if (String(show?.id || "").startsWith("bhakti:3d:")) return "theatre3d";
  if (String(show?.id || "").startsWith("bhakti:2d:")) return "flat2d";
  return "vr360";
}

export function contentKindForShow(show) {
  const id = String(show?.id || "");
  if (id.startsWith("bhakti:2d:video:")) return "tirth-show";
  if (show?.kind === "vr360" || id.startsWith("tirth:vr:")) return "tirth-show";
  if (id.includes(":series:") || show?.seriesId || show?.webseriesId) return "theatre-series";
  if (show?.kind === "theatre3d" || show?.kind === "flat2d") return "theatre-series";
  return "tirth-show";
}

export function searchBucketForKind(kind) {
  switch (kind) {
    case "vr360":
      return "vr";
    case "theatre3d":
      return "theatre";
    case "flat2d":
      return "bhakti";
    case "abhishek":
      return "abhishek";
    case "temple":
      return "aajKe";
    case "live":
      return "liveDarshan";
    default:
      return null;
  }
}
