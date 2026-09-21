import { memoryGate } from "./memguard.mjs";

const GORSE_URL = process.env.GORSE_URL || "http://127.0.0.1:8087";

async function gorse(method, path, body) {
  const res = await fetch(`${GORSE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`gorse ${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function health() {
  try {
    const ready = await gorse("GET", "/api/health/ready");
    return { ok: true, gorse: ready };
  } catch (e) {
    return { ok: false, error: e.message, body: e.body };
  }
}

export async function upsertItems(items) {
  if (!items.length) return { RowAffected: 0 };
  const chunk = 80;
  let affected = 0;
  for (let i = 0; i < items.length; i += chunk) {
    await memoryGate("upsert");
    const part = items.slice(i, i + chunk);
    const r = await gorse("POST", "/api/items", part);
    affected += r?.RowAffected || part.length;
  }
  return { RowAffected: affected };
}

/** DELETE /api/item/{id}; 404 is treated as already gone. */
export async function deleteItems(ids) {
  if (!ids?.length) return { RowAffected: 0 };
  let affected = 0;
  for (const id of ids) {
    if (!id) continue;
    await memoryGate("delete");
    try {
      await gorse("DELETE", `/api/item/${encodeURIComponent(id)}`);
      affected += 1;
    } catch (e) {
      if (e.status === 404) continue;
      throw e;
    }
  }
  return { RowAffected: affected };
}

export async function ensureUser(userId) {
  const id = String(userId || "").trim();
  if (!id) return;
  try {
    await gorse("POST", "/api/user", { UserId: id, Labels: {} });
  } catch (e) {
    if (e.status !== 409 && e.status !== 400) throw e;
  }
}

export async function insertFeedback(rows) {
  if (!rows.length) return { RowAffected: 0 };
  const users = [...new Set(rows.map((r) => r.UserId).filter(Boolean))];
  for (const userId of users) {
    try {
      await ensureUser(userId);
    } catch {
      /* Gorse still accepts feedback for unknown users in some versions */
    }
  }
  return gorse("POST", "/api/feedback", rows);
}

export async function deleteFeedback(type, userId, itemId) {
  const p = `/api/feedback/${encodeURIComponent(type)}/${encodeURIComponent(userId)}/${encodeURIComponent(itemId)}`;
  return gorse("DELETE", p);
}

function asScored(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x, i) => {
    if (typeof x === "string") return { Id: x, Score: list.length - i };
    return { Id: x.Id || x.id || x.ItemId, Score: x.Score ?? x.score ?? 0 };
  }).filter((x) => x.Id);
}

export async function recommend(userId, n = 20, category) {
  const q = new URLSearchParams({ n: String(n) });
  if (category) q.set("category", category);
  try {
    const list = await gorse("GET", `/api/recommend/${encodeURIComponent(userId)}?${q}`);
    return asScored(list);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

export async function latest(n = 20, category) {
  const q = new URLSearchParams({ n: String(n) });
  if (category) q.set("category", category);
  const list = await gorse("GET", `/api/latest?${q}`);
  return asScored(list);
}

export async function similar(itemId, n = 10, category) {
  const q = new URLSearchParams({ n: String(n) });
  if (category) q.set("category", category);
  const list = await gorse(
    "GET",
    `/api/item-to-item/neighbors/${encodeURIComponent(itemId)}?${q}`,
  );
  return asScored(list);
}

export { GORSE_URL };
