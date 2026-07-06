// Assign every PCO person a primary_campus, round-robin across the given
// campus ids. Used to simulate a multi-campus church for testing.
//
//   node scripts/distribute-campuses.mjs 123475 123476 123477 123478 123479

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


const CAMPUSES = process.argv.slice(2);
if (CAMPUSES.length === 0) {
  console.error("Usage: node scripts/distribute-campuses.mjs <campusId> [campusId...]");
  process.exit(1);
}

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
async function pco(method, path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await throttle();
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep((parseInt(res.headers.get("retry-after") || "20", 10) + 1) * 1000); continue; }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`${method} ${path} failed after retries`);
}

// collect all person ids
const ids = [];
let url = "/people/v2/people?per_page=100";
while (url) {
  const page = await pco("GET", url);
  for (const p of page.data) ids.push(p.id);
  url = page.links?.next ? page.links.next.replace(BASE, "") : null;
}
console.log(`Assigning ${ids.length} people across ${CAMPUSES.length} campuses...`);

let done = 0, failed = 0;
const queue = ids.map((id, i) => ({ id, campus: CAMPUSES[i % CAMPUSES.length] }));
async function worker() {
  while (queue.length) {
    const { id, campus } = queue.shift();
    try {
      await pco("PATCH", `/people/v2/people/${id}`, {
        data: { type: "Person", id, relationships: { primary_campus: { data: { type: "Campus", id: campus } } } },
      });
    } catch (e) {
      failed++;
      if (failed <= 10) console.error("ERR", e.message);
    }
    done++;
    if (done % 100 === 0 || done === ids.length) console.log(`${done}/${ids.length} (failed ${failed})`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`DONE: assigned ${done - failed}/${ids.length}, failed ${failed}`);
