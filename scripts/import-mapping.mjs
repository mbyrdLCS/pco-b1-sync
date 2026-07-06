// Push a local migration's bookkeeping (data/mapping.json — people AND
// household links) into the deployed service's database, chunked to stay
// under request-size limits, and seed the reconcile cursor.
//
//   node scripts/import-mapping.mjs [deployed-url]
//
// Run this after a local bulk backfill. Reads APP_URL + CRON_SECRET from
// .env.local. Safe to re-run (imports are upserts).

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const APP_URL = process.argv[2] || env.APP_URL;
if (!APP_URL || !env.CRON_SECRET) {
  console.error("Need APP_URL (arg or .env.local) and CRON_SECRET in .env.local");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(new URL("../data/mapping.json", import.meta.url), "utf8"));
const people = Object.entries(data.people ?? {}).map(([pcoId, e]) => ({
  pcoId,
  b1Id: e.b1Id,
  updatedAt: e.updatedAt,
}));
const households = Object.entries(data.households ?? {}).map(([pcoHouseholdId, b1HouseholdId]) => ({
  pcoHouseholdId,
  b1HouseholdId,
}));
console.log(`Importing ${people.length} people links + ${households.length} household links -> ${APP_URL}`);

async function post(payload) {
  const res = await fetch(`${APP_URL}/api/admin/import-mapping`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`import failed (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const CHUNK = 5000;
let sent = 0;
for (let i = 0; i < people.length; i += CHUNK) {
  await post({ entries: people.slice(i, i + CHUNK) });
  sent += Math.min(CHUNK, people.length - i);
  console.log(`  people: ${sent}/${people.length}`);
}
for (let i = 0; i < households.length; i += CHUNK) {
  await post({ households: households.slice(i, i + CHUNK) });
  console.log(`  households: ${Math.min(i + CHUNK, households.length)}/${households.length}`);
}

// Seed the reconcile cursor to one hour ago so the nightly cron doesn't
// attempt a full-org sweep on its first run.
const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
await post({ reconcileSince: since });
console.log(`  reconcile cursor seeded to ${since}`);
console.log("✅ Import complete.");
