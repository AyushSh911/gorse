import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMemAvailableMb, memoryGate } from "./memguard.mjs";

describe("parseMemAvailableMb", () => {
  it("prefers MemAvailable over MemFree", () => {
    const text = "MemTotal: 4000000 kB\nMemFree: 100000 kB\nMemAvailable: 512000 kB\n";
    assert.equal(parseMemAvailableMb(text), 500);
  });

  it("falls back to MemFree", () => {
    assert.equal(parseMemAvailableMb("MemFree: 204800 kB\n"), 200);
  });

  it("returns null when unparseable", () => {
    assert.equal(parseMemAvailableMb(""), null);
    assert.equal(parseMemAvailableMb("nope"), null);
    assert.equal(parseMemAvailableMb(null), null);
  });
});

describe("memoryGate", () => {
  it("no-ops when memory is plentiful", async () => {
    let sleeps = 0;
    await memoryGate("test", {
      lowMb: 350,
      readMeminfo: async () => "MemAvailable: 2000000 kB\n",
      sleep: async () => {
        sleeps += 1;
      },
      log: () => {},
    });
    assert.equal(sleeps, 0);
  });

  it("throttles then proceeds when memory recovers", async () => {
    let calls = 0;
    const sleeps = [];
    const logs = [];
    await memoryGate("upsert", {
      lowMb: 350,
      readMeminfo: async () => {
        calls += 1;
        // first call low, second call recovered
        if (calls === 1) return "MemAvailable: 100000 kB\n"; // ~97 MiB
        return "MemAvailable: 800000 kB\n";
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: (...a) => logs.push(a.join(" ")),
    });
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [1000]);
    assert.match(logs[0], /throttling \(upsert\)/);
  });

  it("fail-opens when meminfo cannot be read", async () => {
    let sleeps = 0;
    await memoryGate("sync", {
      lowMb: 350,
      readMeminfo: async () => {
        throw new Error("ENOENT");
      },
      sleep: async () => {
        sleeps += 1;
      },
      log: () => {},
    });
    assert.equal(sleeps, 0);
  });

  it("stops waiting after max window even if still low", async () => {
    let t = 0;
    const logs = [];
    await memoryGate("sync", {
      lowMb: 350,
      readMeminfo: async () => "MemAvailable: 50000 kB\n",
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      log: (...a) => logs.push(a.join(" ")),
    });
    assert.ok(logs.some((l) => /giving up/.test(l)));
  });
});
