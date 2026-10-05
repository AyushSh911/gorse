import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FRESHNESS_MS,
  applyFreshness,
  impressionRows,
  parseFeedback,
  swapQuota,
} from "./freshness.mjs";

const DAY = 24 * 60 * 60 * 1000;

function hit(id, kind = "vr360") {
  return { kind, id, score: 10, itemId: id };
}

function catalog(ids, kind = "vr360") {
  return ids.map((id) => ({ ItemId: id, kind, appId: id }));
}

describe("parseFeedback", () => {
  it("marks watch as watched and ignores read", () => {
    const { watched, impressions } = parseFeedback([
      { FeedbackType: "read", ItemId: "a", Timestamp: "2026-01-01T00:00:00.000Z" },
      { FeedbackType: "watch", ItemId: "b", Timestamp: "2026-01-02T00:00:00.000Z" },
    ]);
    assert.deepEqual([...watched], ["b"]);
    assert.equal(impressions.size, 0);
  });

  it("keeps the earliest impression timestamp", () => {
    const { impressions } = parseFeedback([
      { FeedbackType: "impression", ItemId: "a", Timestamp: "2026-01-03T00:00:00.000Z" },
      { FeedbackType: "impression", ItemId: "a", Timestamp: "2026-01-01T00:00:00.000Z" },
    ]);
    assert.equal(impressions.get("a"), Date.parse("2026-01-01T00:00:00.000Z"));
  });
});

describe("swapQuota", () => {
  it("is 3 for a 12-item rail and stays between 1 and 3", () => {
    assert.equal(swapQuota(12), 3);
    assert.equal(swapQuota(8), 2);
    assert.equal(swapQuota(40), 3);
    assert.equal(swapQuota(1), 1);
    assert.equal(swapQuota(0), 0);
  });
});

describe("applyFreshness", () => {
  const now = Date.parse("2026-10-04T00:00:00.000Z");
  const hits = [hit("a"), hit("b"), hit("c"), hit("d")];
  const pool = catalog(["a", "b", "c", "d", "e", "f", "g"]);

  it("keeps Gorse order and flags unwatched when there are no impressions", () => {
    const out = applyFreshness({
      hits,
      catalog: pool,
      profileId: "u1",
      watched: new Set(),
      impressions: new Map(),
      now,
    });
    assert.deepEqual(out.items.map((x) => x.id), ["a", "b", "c", "d"]);
    assert.equal(out.items.every((x) => x.watched === false), true);
    assert.equal(out.items.every((x) => x.fresh === false), true);
    assert.deepEqual(out.newImpressionIds, ["a", "b", "c", "d"]);
  });

  it("sets watched on hits the user has watched", () => {
    const out = applyFreshness({
      hits,
      catalog: pool,
      profileId: "u1",
      watched: new Set(["b"]),
      impressions: new Map(),
      now,
    });
    assert.equal(out.items.find((x) => x.id === "b").watched, true);
    assert.equal(out.items.find((x) => x.id === "a").watched, false);
  });

  it("swaps stale shown items for unseen catalog items after 3 days", () => {
    const shown = now - FRESHNESS_MS;
    const out = applyFreshness({
      hits,
      catalog: pool,
      profileId: "u1",
      watched: new Set(),
      impressions: new Map([
        ["a", shown],
        ["b", shown],
        ["c", shown],
        ["d", shown],
      ]),
      now,
    });
    assert.equal(out.items.length, 4);
    const freshIds = out.items.filter((x) => x.fresh).map((x) => x.id);
    assert.equal(freshIds.length, swapQuota(4));
    assert.equal(freshIds.every((id) => ["e", "f", "g"].includes(id)), true);
    assert.equal(out.items.filter((x) => x.fresh).every((x) => x.watched === false), true);
    assert.deepEqual(out.newImpressionIds.sort(), [...freshIds].sort());
  });

  it("does not swap items shown inside the current 3-day window", () => {
    const out = applyFreshness({
      hits,
      catalog: pool,
      profileId: "u1",
      watched: new Set(),
      impressions: new Map([
        ["a", now - DAY],
        ["b", now - DAY],
        ["c", now - DAY],
        ["d", now - DAY],
      ]),
      now,
    });
    assert.deepEqual(out.items.map((x) => x.id), ["a", "b", "c", "d"]);
    assert.equal(out.items.every((x) => x.fresh === false), true);
    assert.deepEqual(out.newImpressionIds, []);
  });

  it("skips watched catalog items as fillers", () => {
    const shown = now - FRESHNESS_MS;
    const out = applyFreshness({
      hits: [hit("a")],
      catalog: catalog(["a", "e", "f"]),
      profileId: "u1",
      watched: new Set(["e"]),
      impressions: new Map([["a", shown]]),
      now,
    });
    assert.equal(out.items[0].id, "f");
    assert.equal(out.items[0].fresh, true);
  });

  it("keeps the current card when the catalog has no eligible filler", () => {
    const shown = now - FRESHNESS_MS;
    const out = applyFreshness({
      hits: [hit("a")],
      catalog: catalog(["a"]),
      profileId: "u1",
      watched: new Set(),
      impressions: new Map([["a", shown]]),
      now,
    });
    assert.equal(out.items[0].id, "a");
    assert.equal(out.items[0].fresh, false);
  });

  it("picks different fillers for different profiles in the same window", () => {
    const shown = now - FRESHNESS_MS;
    const impressions = new Map([
      ["a", shown],
      ["b", shown],
      ["c", shown],
      ["d", shown],
    ]);
    const args = { hits, catalog: pool, watched: new Set(), impressions, now };
    const a = applyFreshness({ ...args, profileId: "alice" }).items.filter((x) => x.fresh).map((x) => x.id);
    const b = applyFreshness({ ...args, profileId: "bob" }).items.filter((x) => x.fresh).map((x) => x.id);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.notEqual(a[0], b[0]);
  });
});

describe("impressionRows", () => {
  it("builds Gorse rows only for new ids", () => {
    const rows = impressionRows("u1", ["a", "b"], "2026-10-04T00:00:00.000Z");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].FeedbackType, "impression");
    assert.equal(rows[0].UserId, "u1");
    assert.equal(rows[0].Value, 1);
    assert.deepEqual(rows.map((r) => r.ItemId), ["a", "b"]);
  });
});
