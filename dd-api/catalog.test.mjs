import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLatestBuckets, timestampForItem } from "./catalog.mjs";
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
});
