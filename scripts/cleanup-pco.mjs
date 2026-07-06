// Delete people from a Planning Center TEST org (bulk reset between test runs).
//
//   node scripts/cleanup-pco.mjs id1 id2    # delete ALL people EXCEPT these ids
//   node scripts/cleanup-pco.mjs --all      # delete every person (careful!)
//
// Only for test orgs — never point this at a real church's data.

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const AUTH = "Basic " + Buffer.from(`${env.PCO_APP_ID}:${env.PCO_SECRET}`).toString("base64");

// ─── SAFETY LOCK ───────────────────────────────────────────────────────────
// This script MUTATES a Planning Center org (creates/deletes/modifies data).
// It must only ever run against the ChurchApps TEST org. Refuse anything else.
const TEST_ORG_ID = "430310";
{
  const res = await fetch(`${BASE}/people/v2/people?per_page=1`, { headers: { Authorization: AUTH } });
  const orgId = String((await res.json())?.meta?.parent?.id ?? "unknown");
  const allowed = process.env.FORCE_PCO_ORG || TEST_ORG_ID;
  if (orgId !== String(allowed)) {
    console.error(`SAFETY STOP: .env.local points at PCO org ${orgId} — NOT the test org (${TEST_ORG_ID}).`);
    console.error("This script writes/deletes Planning Center data and must never touch a real church.");
    console.error("If you are absolutely sure, re-run with FORCE_PCO_ORG=" + orgId);
    process.exit(1);
  }
}
// ───────────────────────────────────────────────────────────────────────────


const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/cleanup-pco.mjs <keepId...> | --all");
  console.error("Refusing to run without an explicit keep-list or --all.");
  process.exit(1);
}
const keep = new Set(args[0] === "--all" ? [] : args);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stamps = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < 20000);
    if (stamps.length < 90) { stamps.push(now); return; }
    await sleep(20000 - (now - stamps[0]) + 50);
  }
}
async function pco(method, path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await throttle();
    const res = await fetch(BASE + path, { method, headers: { Authorization: AUTH } });
    if (res.status === 429) { await sleep((parseInt(res.headers.get("retry-after") || "20", 10) + 1) * 1000); continue; }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`${method} ${path} failed after retries`);
}

// collect all ids to delete
const ids = [];
let url = "/people/v2/people?per_page=100";
while (url) {
  const page = await pco("GET", url);
  for (const p of page.data) if (!keep.has(p.id)) ids.push(p.id);
  url = page.links?.next ? page.links.next.replace(BASE, "") : null;
}

console.log(`Deleting ${ids.length} people (keeping ${[...keep].join(", ")})`);
let done = 0;
const queue = [...ids];
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    try { await pco("DELETE", `/people/v2/people/${id}`); } catch (e) { console.error("ERR", e.message); }
    done++;
    if (done % 50 === 0 || done === ids.length) console.log(`${done}/${ids.length} deleted`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`DONE: deleted ${done}/${ids.length}`);
