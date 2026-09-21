import { readFile } from "node:fs/promises";

const DEFAULT_LOW_MB = 350;
const MAX_WAIT_MS = 90_000;
const BACKOFF_CAP_MS = 10_000;

/**
 * Parse MemAvailable (preferred) or MemFree from /proc/meminfo text.
 * @param {string} text
 * @returns {number|null} available MiB, or null if unparseable
 */
export function parseMemAvailableMb(text) {
  if (!text || typeof text !== "string") return null;
  const avail = text.match(/^MemAvailable:\s+(\d+)\s+kB/m);
  if (avail) return Math.floor(Number(avail[1]) / 1024);
  const free = text.match(/^MemFree:\s+(\d+)\s+kB/m);
  if (free) return Math.floor(Number(free[1]) / 1024);
  return null;
}

async function defaultReadMeminfo() {
  return readFile("/proc/meminfo", "utf8");
}

function sleep(ms, sleeper) {
  return (sleeper || ((n) => new Promise((r) => setTimeout(r, n))))(ms);
}

/**
 * Pause while host MemAvailable is below MEM_LOW_MB so sync/upsert slows
 * down instead of pushing the VM into global OOM.
 *
 * Fail-open: if meminfo cannot be read, never block.
 *
 * @param {string} [context]
 * @param {{
 *   lowMb?: number,
 *   readMeminfo?: () => Promise<string>,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   log?: (...args: unknown[]) => void,
 * }} [opts]
 */
export async function memoryGate(context = "job", opts = {}) {
  const lowMb = Number(opts.lowMb ?? process.env.MEM_LOW_MB ?? DEFAULT_LOW_MB);
  const readMeminfo = opts.readMeminfo || defaultReadMeminfo;
  const sleeper = opts.sleep;
  const now = opts.now || Date.now;
  const log = opts.log || console.warn;

  let delay = 1000;
  const started = now();

  for (;;) {
    let mb = null;
    try {
      mb = parseMemAvailableMb(await readMeminfo());
    } catch {
      return; // fail-open
    }
    if (mb == null) return; // fail-open
    if (!(lowMb > 0) || mb >= lowMb) return;
    if (now() - started >= MAX_WAIT_MS) {
      log(
        `memguard: giving up after ${MAX_WAIT_MS}ms (${context}), MemAvailable=${mb}mb low=${lowMb}`,
      );
      return;
    }
    log(`memguard: throttling (${context}), MemAvailable=${mb}mb low=${lowMb}`);
    await sleep(delay, sleeper);
    delay = Math.min(delay * 2, BACKOFF_CAP_MS);
  }
}
