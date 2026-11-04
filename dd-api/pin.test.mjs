import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FLAT2D_APP_VIDEO_SLOTS,
  FLAT2D_HIDE_IDS,
  PIN_IDS,
  PIN_UNTIL,
  pickFlat2dVideos,
  pinFeatured,
} from "./pin.mjs";

function hit(id, kind = "vr360") {
  return { kind, id, score: 1, itemId: id };
}

const before = PIN_UNTIL - 1000;
const after = PIN_UNTIL + 1000;
const ids = (out) => out.map((x) => x.id);

describe("pinFeatured", () => {
  it("puts tirth:vr:163 then tirth:vr:161 first before the deadline", () => {
    assert.deepEqual(PIN_IDS, ["tirth:vr:163", "tirth:vr:161"]);
    const out = pinFeatured([hit("tirth:vr:001"), hit("tirth:vr:002")], {
      n: 5,
      now: before,
    });
    assert.deepEqual(ids(out), ["tirth:vr:163", "tirth:vr:161", "tirth:vr:001", "tirth:vr:002"]);
    for (const p of out.slice(0, 2)) {
      assert.equal(p.itemId, p.id);
      assert.equal(p.kind, "vr360");
      assert.equal(p.pinned, true);
    }
    assert.ok(out[0].score > out[1].score);
  });

  it("runs until end of 15 Nov 2026 IST", () => {
    assert.equal(PIN_UNTIL, Date.parse("2026-11-15T23:59:59.000+05:30"));
  });

  it("is active from 27 Oct 2026 for the vr360 category and no category", () => {
    const now = Date.parse("2026-10-27T10:00:00.000+05:30");
    for (const category of ["vr360", undefined]) {
      const out = pinFeatured([hit("tirth:vr:001")], { category, n: 5, now });
      assert.deepEqual(ids(out).slice(0, 2), PIN_IDS);
    }
  });

  it("leaves the list unchanged after the deadline", () => {
    const items = [hit("tirth:vr:001")];
    const out = pinFeatured(items, { n: 5, now: after });
    assert.deepEqual(ids(out), ["tirth:vr:001"]);
  });

  it("does not pin a non-vr360 category", () => {
    const out = pinFeatured([hit("26", "temple")], {
      category: "temple",
      n: 5,
      now: before,
    });
    assert.deepEqual(ids(out), ["26"]);
  });

  it("drops later duplicates and keeps length n", () => {
    const out = pinFeatured(
      [hit("tirth:vr:161"), hit("tirth:vr:001"), hit("tirth:vr:163"), hit("tirth:vr:002")],
      { category: "vr360", n: 4, now: before },
    );
    assert.deepEqual(ids(out), ["tirth:vr:163", "tirth:vr:161", "tirth:vr:001", "tirth:vr:002"]);
  });

  it("returns only the first pin when n is 1", () => {
    const out = pinFeatured([hit("tirth:vr:001")], { n: 1, now: before });
    assert.deepEqual(ids(out), ["tirth:vr:163"]);
  });
});

describe("pinFeatured flat2d (Bhakti TV, released app)", () => {
  const f = (id) => hit(id, "flat2d");
  const vid = (n) => f("bhakti:2d:video:" + n);
  const vids = ["042", "034", "041", "033", "040", "037", "036", "035", "032"].map(vid);

  it("pickFlat2dVideos returns exactly six visible videos, never 033/034", () => {
    const out = pickFlat2dVideos(vids, null);
    assert.equal(FLAT2D_APP_VIDEO_SLOTS, 6);
    assert.deepEqual(ids(out), ["042", "041", "040", "037", "036", "035"].map((n) => "bhakti:2d:video:" + n));
    for (const id of FLAT2D_HIDE_IDS) assert.ok(!ids(out).includes(id));
  });

  it("pickFlat2dVideos honours the rail-eligible set", () => {
    const out = pickFlat2dVideos(vids, new Set(["bhakti:2d:video:041", "bhakti:2d:video:033"]));
    assert.deepEqual(ids(out), ["bhakti:2d:video:041"]);
  });

  it("leads with Dashavatar then Krishna Leelayein, one hit per series, then the fixed videos", () => {
    const fixed = pickFlat2dVideos(vids, null);
    const out = pinFeatured(
      [f("bhakti:2d:ep:04:003"), f("bhakti:2d:series:14"), vid("099"), f("bhakti:2d:ep:14:002"), vid("034")],
      { category: "flat2d", n: 36, now: after, videos: fixed },
    );
    assert.deepEqual(ids(out), ["bhakti:2d:series:03", "bhakti:2d:series:04", "bhakti:2d:series:14", ...ids(fixed)]);
    assert.equal(out[0].pinned, true);
    assert.equal(out[0].kind, "flat2d");
  });

  it("does not touch other categories", () => {
    const out = pinFeatured([vid("033")], { category: "theatre3d", n: 5, now: after });
    assert.deepEqual(ids(out), ["bhakti:2d:video:033"]);
  });
});
