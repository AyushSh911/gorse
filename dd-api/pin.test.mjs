import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PIN_IDS,
  PIN_UNTIL,
  pinFeatured,
} from "./pin.mjs";
import { computeFlat2dPlan } from "./catalog.mjs";

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

describe("flat2d is JSON-driven (Gorse only orders)", () => {
  const f = (id) => hit(id, "flat2d");
  const ep = (s, e) => ({ id: `bhakti:2d:ep:${s}:${e}`, kind: "flat2d", seriesId: `bhakti:2d:series:${s}`, title: { en: `S${s}E${e}` } });
  const vid = (n, t = `Video ${n}`) => ({ id: `bhakti:2d:video:${n}`, kind: "flat2d", title: { en: t } });
  const content = {
    shows: [ep("01", "001"), ep("01", "002"), ep("03", "001"), vid("010"), vid("011"), vid("012"), vid("013", "Sundar Kand")],
    webseries: [
      { id: "bhakti:2d:series:01", kind: "flat2d", title: { en: "Krishna" } },
      { id: "bhakti:2d:series:03", kind: "flat2d", title: { en: "Dashavatar" } },
    ],
  };
  const layout = (approved, dtv, disactive = []) => ({
    status: { approvedShowIds: approved, disactiveShowIds: disactive },
    homePreview: { bhaktiDarshanTvShowIds: dtv },
  });
  const all = ["bhakti:2d:ep:01:001", "bhakti:2d:ep:03:001", "bhakti:2d:video:010", "bhakti:2d:video:011", "bhakti:2d:video:012"];

  it("returns only ids the layout makes visible, one per series, series first then singles", () => {
    const plan = computeFlat2dPlan(content, layout(all, []));
    const out = pinFeatured(
      [f("bhakti:2d:video:099"), f("bhakti:2d:ep:01:002"), f("bhakti:2d:series:01"), f("bhakti:2d:video:011"), f("bhakti:2d:series:03")],
      { category: "flat2d", n: 10, flat2dPlan: plan, legacy: false },
    );
    assert.deepEqual(ids(out), ["bhakti:2d:ep:01:002", "bhakti:2d:series:03", "bhakti:2d:video:011"]);
  });

  it("reflects JSON edits: disabling a show removes it, approving one adds it", () => {
    const hits = [f("bhakti:2d:video:010"), f("bhakti:2d:video:011"), f("bhakti:2d:series:03")];
    const before = computeFlat2dPlan(content, layout(all, []));
    const after = computeFlat2dPlan(content, layout(all, [], ["bhakti:2d:video:010", "bhakti:2d:ep:03:001"]));
    const opts = (plan) => ({ category: "flat2d", n: 10, flat2dPlan: plan, legacy: false });
    assert.deepEqual(ids(pinFeatured(hits, opts(before))), ["bhakti:2d:series:03", "bhakti:2d:video:010", "bhakti:2d:video:011"]);
    assert.deepEqual(ids(pinFeatured(hits, opts(after))), ["bhakti:2d:video:011"]);
  });

  it("series first, single videos at the bottom (legacy and v2); nothing visible dropped", () => {
    // rail: series 01 + series 03 + video 010; Ramayana titles excluded
    const plan = computeFlat2dPlan(content, layout([...all, "bhakti:2d:video:013"], ["bhakti:2d:ep:01:001", "bhakti:2d:ep:03:001", "bhakti:2d:video:010", "bhakti:2d:video:013"]));
    assert.deepEqual(plan.railShows, ["bhakti:2d:series:01", "bhakti:2d:series:03", "bhakti:2d:video:010"]);
    assert.equal("legacyVideoSlots" in plan, false);
    const hits = [f("bhakti:2d:video:011"), f("bhakti:2d:video:010"), f("bhakti:2d:series:03"), f("bhakti:2d:ep:01:002"), f("bhakti:2d:video:012")];
    const legacy = pinFeatured(hits, { category: "flat2d", n: 10, flat2dPlan: plan, legacy: true });
    assert.deepEqual(ids(legacy), ["bhakti:2d:show:3:001", "bhakti:2d:show:1:001"]);
    const v2 = pinFeatured(hits, { category: "flat2d", n: 10, flat2dPlan: plan, legacy: false });
    assert.deepEqual(ids(v2), ["bhakti:2d:series:03", "bhakti:2d:ep:01:002", "bhakti:2d:video:011", "bhakti:2d:video:010", "bhakti:2d:video:012"]);
  });

  it("legacy: a series id the layout approves directly is sent as-is (JSON switch)", () => {
    const plan = computeFlat2dPlan(content, layout([...all, "bhakti:2d:series:03"], []));
    const out = pinFeatured([f("bhakti:2d:series:03"), f("bhakti:2d:series:01")], { category: "flat2d", n: 10, flat2dPlan: plan, legacy: true });
    assert.deepEqual(ids(out), ["bhakti:2d:series:03", "bhakti:2d:show:1:001"]);
  });

  it("passes hits through untouched when no plan is loaded", () => {
    const hits = [f("bhakti:2d:video:099")];
    assert.deepEqual(ids(pinFeatured(hits, { category: "flat2d", n: 5 })), ["bhakti:2d:video:099"]);
  });
});
