import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseLatestBuckets,
  timestampForItem,
  fromBlogs,
  fromShows,
  keepSet,
  diffSourceIds,
  loadSource,
} from "./catalog.mjs";
import { toGorseItemId, kindFromGorseItemId, appIdFromGorseItemId } from "./ids.mjs";

describe("parseLatestBuckets", () => {
  it("reads Firebase meta latestBucket_* keys", () => {
    const cats = parseLatestBuckets({
      latestBucket_Bhajan: 76,
      latestBucket_Darshan: 17,
      ignore: 1,
    });
    assert.deepEqual(
      cats.map((c) => c.cat).sort(),
      ["Bhajan", "Darshan"],
    );
    assert.equal(cats.find((c) => c.cat === "Bhajan").bucket, 76);
  });

  it("ignores arrays and missing prefixes", () => {
    assert.deepEqual(parseLatestBuckets(["Bhajan"]), []);
    assert.deepEqual(parseLatestBuckets(null), []);
  });
});

describe("timestampForItem", () => {
  it("orders higher VR ids later than lower ones", () => {
    const a = Date.parse(timestampForItem("tirth:vr:001", "vr360"));
    const b = Date.parse(timestampForItem("tirth:vr:159", "vr360"));
    assert.ok(b > a);
  });

  it("keeps sadhana older than VR so latest is not sadhana-dominated", () => {
    const vr = Date.parse(timestampForItem("tirth:vr:001", "vr360"));
    const sadhana = Date.parse(timestampForItem("sadhana:gayatri", "sadhana"));
    assert.ok(vr > sadhana);
  });
});

describe("ids", () => {
  it("keeps native premium ids", () => {
    assert.equal(toGorseItemId("vr360", "tirth:vr:001"), "tirth:vr:001");
    assert.equal(kindFromGorseItemId("tirth:vr:001"), "vr360");
  });

  it("slugs abhishek display names and maps temple numeric ids", () => {
    assert.equal(toGorseItemId("abhishek", "Mata Vaishnodevi"), "abhishek:3d:mata-vaishnodevi");
    assert.equal(toGorseItemId("temple", "28"), "aaj:darshan:28");
    assert.equal(appIdFromGorseItemId("aaj:darshan:28"), "28");
    assert.equal(appIdFromGorseItemId("aarti:abc"), "abc");
  });

  it("prefixes blog app ids", () => {
    assert.equal(toGorseItemId("blog", "BE_078"), "blog:BE_078");
    assert.equal(kindFromGorseItemId("blog:BE_078"), "blog");
    assert.equal(appIdFromGorseItemId("blog:BE_078"), "BE_078");
  });
});

describe("fromBlogs", () => {
  it("maps Blog_ID to blog: ItemId with category labels", () => {
    const items = fromBlogs({
      categories: [
        {
          blogCategoryID: "BC_01",
          blogs: [
            { Blog_ID: "BE_078", Blog_Title: { en: "Parvati Aarti", hi: "" } },
            { Blog_ID: "", Blog_Title: { en: "skip", hi: "" } },
          ],
        },
      ],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].ItemId, "blog:BE_078");
    assert.ok(items[0].Categories.includes("blog"));
    assert.ok(items[0].Categories.includes("BC_01"));
    assert.match(String(items[0].Comment), /Parvati/);
  });
});

describe("diffSourceIds", () => {
  it("adds new ids, updates kept ids, deletes removed ids per source", () => {
    const oldIndex = new Map([
      ["blog:old", { kind: "blog", appId: "old", source: "blog" }],
      ["blog:keep", { kind: "blog", appId: "keep", source: "blog" }],
      ["reel:x", { kind: "reel", appId: "x", source: "reel" }],
    ]);
    const { toDelete, added, updated } = diffSourceIds(
      oldIndex,
      {
        blog: [{ ItemId: "blog:keep" }, { ItemId: "blog:new" }],
        reel: [{ ItemId: "reel:x" }],
      },
      [],
    );
    assert.deepEqual(added.sort(), ["blog:new"]);
    assert.deepEqual(updated.sort(), ["blog:keep", "reel:x"]);
    assert.deepEqual(toDelete.sort(), ["blog:old"]);
  });

  it("does not delete ids for failed sources", () => {
    const oldIndex = new Map([
      ["reel:a", { kind: "reel", appId: "a", source: "reel" }],
      ["blog:b", { kind: "blog", appId: "b", source: "blog" }],
    ]);
    const { toDelete, added } = diffSourceIds(
      oldIndex,
      {
        blog: [{ ItemId: "blog:b" }, { ItemId: "blog:c" }],
        reel: [],
      },
      ["reel"],
    );
    assert.ok(!toDelete.includes("reel:a"));
    assert.deepEqual(added, ["blog:c"]);
    assert.deepEqual(toDelete, []);
  });
});

describe("loadSource", () => {
  it("reads sadhana.json from jsons/", async () => {
    const rows = await loadSource("sadhana");
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);
    assert.ok(rows[0].id);
  });

  it("reads premium-layout.json from jsons/", async () => {
    const layout = await loadSource("layout");
    assert.ok(layout?.status);
  });

  it("reads premium-trailers.json from jsons/", async () => {
    const file = await loadSource("trailers");
    assert.ok(Array.isArray(file?.trailers));
    assert.ok(file.trailers.length > 0);
    assert.ok(file.trailers[0].id);
    assert.ok(file.trailers[0].target?.id);
  });
});

describe("fromShows + keepSet", () => {
  it("drops shows removed from approvedShowIds into the delete set via diff", () => {
    const shows = [
      { id: "tirth:vr:001", title: { en: "Keep" }, kind: "vr360", namespace: "tirth" },
      { id: "tirth:vr:002", title: { en: "Drop" }, kind: "vr360", namespace: "tirth" },
    ];
    const before = fromShows(
      shows,
      keepSet({ status: { approvedShowIds: ["tirth:vr:001", "tirth:vr:002"] } }).keep,
      new Set(),
    );
    const after = fromShows(
      shows,
      keepSet({ status: { approvedShowIds: ["tirth:vr:001"] } }).keep,
      new Set(),
    );
    assert.equal(before.length, 2);
    assert.equal(after.length, 1);

    const oldIndex = new Map(
      before.map((it) => [it.ItemId, { kind: it.Labels.kind, appId: it.ItemId, source: "shows" }]),
    );
    const { toDelete } = diffSourceIds(oldIndex, { shows: after }, []);
    assert.deepEqual(toDelete, ["tirth:vr:002"]);
  });
});
