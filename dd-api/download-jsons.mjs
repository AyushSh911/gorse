#!/usr/bin/env node
/**
 * Download static catalog JSONs from CDN into dd-api/jsons/.
 * Usage: node download-jsons.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const JSONS_DIR = join(ROOT, "jsons");
const SOURCES_FILE = join(JSONS_DIR, "sources.json");

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function main() {
  await mkdir(JSONS_DIR, { recursive: true });
  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf8"));
  const results = [];
  let failed = 0;

  for (const [key, { file, url }] of Object.entries(sources)) {
    if (!file) {
      console.error(`skip ${key}: missing file`);
      failed += 1;
      continue;
    }
    if (!url) {
      console.log(`skip ${key} → ${file} (local-only)`);
      continue;
    }
    const dest = join(JSONS_DIR, file);
    try {
      const data = await fetchJson(url);
      await writeFile(dest, JSON.stringify(data, null, 2) + "\n", "utf8");
      const size = Buffer.byteLength(JSON.stringify(data));
      console.log(`ok  ${key} → ${file} (${size} bytes)`);
      results.push({ key, file, ok: true, size });
    } catch (e) {
      console.error(`ERR ${key} → ${file}: ${e.message || e}`);
      results.push({ key, file, ok: false, error: String(e.message || e) });
      failed += 1;
    }
  }

  if (failed) {
    console.error(`\nFailed ${failed}/${Object.keys(sources).length} downloads`);
    process.exit(1);
  }
  console.log(`\nDownloaded ${results.length} files into ${JSONS_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
