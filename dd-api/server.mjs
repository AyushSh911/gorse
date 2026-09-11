import http from "node:http";
import { itemIndex, loadItemIndex, syncCatalog } from "./catalog.mjs";
import {
  appIdFromGorseItemId,
  kindFromGorseItemId,
  toGorseItemId,
} from "./ids.mjs";
import * as gorse from "./gorse.mjs";

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || "0.0.0.0";

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function mapHits(rows) {
  return rows.map((r) => {
    const cached = itemIndex.get(r.Id);
    const kind = cached?.kind || kindFromGorseItemId(r.Id);
    const id = cached?.appId || appIdFromGorseItemId(r.Id);
    return {
      kind,
      id,
      score: r.Score,
      itemId: r.Id,
    };
  }).filter((x) => x.kind && x.id);
}

function dedupeSeries(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const seriesKey = h.itemId?.match(/^(bhakti:(?:3d|2d):(?:ep|series):[^:]+)/)?.[1] || h.id;
    if (seen.has(seriesKey)) continue;
    seen.add(seriesKey);
    out.push(h);
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/v1/health") {
      const h = await gorse.health();
      return send(res, h.ok ? 200 : 503, h);
    }

    if (req.method === "POST" && url.pathname === "/v1/sync") {
      const result = await syncCatalog();
      return send(res, 200, {
        itemCount: result.itemCount,
        counts: result.counts,
        errors: result.errors,
        upsert: result.upsert,
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        delete: result.delete,
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/feedback") {
      const body = await readBody(req);
      const profileId = String(body.profileId || "").trim();
      if (!profileId) return send(res, 400, { error: "profileId required" });
      const rows = (body.items || []).map((it) => ({
        FeedbackType: it.feedbackType,
        UserId: profileId,
        ItemId: toGorseItemId(it.kind, it.id),
        Value: it.value == null ? 1 : Number(it.value),
        Timestamp: it.timestamp || new Date().toISOString(),
      })).filter((r) => r.ItemId && r.FeedbackType);
      if (!rows.length) return send(res, 400, { error: "items required" });
      await gorse.ensureUser(profileId);
      const r = await gorse.insertFeedback(rows);
      return send(res, 200, r);
    }

    if (req.method === "DELETE" && url.pathname === "/v1/feedback") {
      const body = await readBody(req);
      const profileId = String(body.profileId || "").trim();
      const kind = body.kind;
      const id = body.id;
      const type = body.feedbackType || "like";
      if (!profileId || !id) return send(res, 400, { error: "profileId and id required" });
      const r = await gorse.deleteFeedback(type, profileId, toGorseItemId(kind, id));
      return send(res, 200, r);
    }

    if (req.method === "GET" && url.pathname === "/v1/recommend") {
      const profileId = String(url.searchParams.get("profileId") || "").trim();
      const n = Number(url.searchParams.get("n") || 20);
      const category = url.searchParams.get("category") || undefined;
      if (!profileId) {
        const hits = mapHits(await gorse.latest(n, category));
        return send(res, 200, { source: "latest", items: hits });
      }
      let hits = mapHits(await gorse.recommend(profileId, n * 3, category));
      hits = dedupeSeries(hits).slice(0, n);
      if (!hits.length) {
        hits = mapHits(await gorse.latest(n, category));
        return send(res, 200, { source: "latest", items: hits });
      }
      return send(res, 200, { source: "recommend", items: hits });
    }

    if (req.method === "GET" && url.pathname === "/v1/similar") {
      const kind = url.searchParams.get("kind");
      const id = url.searchParams.get("id");
      const n = Number(url.searchParams.get("n") || 10);
      const category = url.searchParams.get("category") || undefined;
      if (!id) return send(res, 400, { error: "id required" });
      const itemId = toGorseItemId(kind, id);
      const hits = dedupeSeries(mapHits(await gorse.similar(itemId, n * 2, category))).slice(0, n);
      return send(res, 200, { items: hits });
    }

    if (req.method === "GET" && url.pathname === "/v1/latest") {
      const n = Number(url.searchParams.get("n") || 20);
      const category = url.searchParams.get("category") || undefined;
      const hits = mapHits(await gorse.latest(n, category));
      return send(res, 200, { items: hits });
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, e.status || 500, { error: e.message, body: e.body });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`dd-api listening on http://${HOST}:${PORT} (gorse ${gorse.GORSE_URL})`);
  void loadItemIndex().then((n) => {
    console.log(`itemIndex loaded ${n} rows`);
    if (process.env.SKIP_BOOT_SYNC === "1") return;
    return syncCatalog().then((r) => {
      console.log(`boot sync ${r.itemCount}`, r.counts);
    });
  }).catch((e) => console.error("boot sync failed", e));
});
