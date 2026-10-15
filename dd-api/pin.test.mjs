import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PIN_ID, PIN_UNTIL, pinFeatured } from "./pin.mjs";

function hit(id, kind = "vr360") {
  return { kind, id, score: 1, itemId: id };
}

const before = PIN_UNTIL - 1000;
const after = PIN_UNTIL + 1000;

describe("pinFeatured", () => {
  it("puts tirth:vr:161 first before the deadline", () => {
    const out = pinFeatured([hit("tirth:vr:001"), hit("tirth:vr:002")], {
      n: 5,
      now: before,
    });
    assert.equal(out[0].id, PIN_ID);
    assert.equal(out[0].itemId, PIN_ID);
    assert.equal(out[0].kind, "vr360");
    assert.equal(out[0].pinned, true);
    assert.deepEqual(out.slice(1).map((x) => x.id), ["tirth:vr:001", "tirth:vr:002"]);
  });

  it("leaves the list unchanged after the deadline", () => {
    const items = [hit("tirth:vr:001")];
    const out = pinFeatured(items, { n: 5, now: after });
    assert.deepEqual(out.map((x) => x.id), ["tirth:vr:001"]);
  });

  it("does not pin a non-vr360 category", () => {
    const out = pinFeatured([hit("26", "temple")], {
      category: "temple",
      n: 5,
      now: before,
    });
    assert.deepEqual(out.map((x) => x.id), ["26"]);
  });

  it("drops a later duplicate and keeps length n", () => {
    const out = pinFeatured(
      [hit("tirth:vr:001"), hit(PIN_ID), hit("tirth:vr:002"), hit("tirth:vr:003")],
      { category: "vr360", n: 3, now: before },
    );
    assert.deepEqual(out.map((x) => x.id), [PIN_ID, "tirth:vr:001", "tirth:vr:002"]);
    assert.equal(out.filter((x) => x.id === PIN_ID).length, 1);
  });
});
