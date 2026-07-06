// Pre-flight check for onboarding a church. Verifies credentials, scopes,
// product access, and deployment wiring BEFORE running any sync.
//
//   node scripts/preflight.mjs [deployed-url]
//
// Reads PCO_* and B1_* from .env.local. Safe: only reads, plus one
// create-then-delete probe campus in B1 to verify the settings:write scope.

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const PCO_BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const B1_BASE = env.B1_API_BASE || "https://api.churchapps.org";
const APP_URL = process.argv[2] || env.APP_URL;
if (!APP_URL) {
  console.error("Usage: node scripts/preflight.mjs <deployed-url>   (or set APP_URL in .env.local)");
  process.exit(1);
}
const PCO_AUTH = "Basic " + Buffer.from(`${env.PCO_APP_ID}:${env.PCO_SECRET}`).toString("base64");

let pass = 0, warn = 0, fail = 0;
const ok = (msg) => { pass++; console.log(`  ✅ ${msg}`); };
const wn = (msg) => { warn++; console.log(`  ⚠️  ${msg}`); };
const bad = (msg) => { fail++; console.log(`  ❌ ${msg}`); };

async function pco(path) {
  const res = await fetch(PCO_BASE + path, { headers: { Authorization: PCO_AUTH } });
  return { status: res.status, body: res.ok ? await res.json() : null };
}
async function b1(path, init = {}) {
  const res = await fetch(B1_BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.B1_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body };
}

console.log(`\nPre-flight for PCO → B1 sync  (app: ${APP_URL})\n`);

// --- Planning Center ---
console.log("Planning Center:");
const people = await pco("/people/v2/people?per_page=1");
if (people.status === 200) ok(`credentials valid — org has ${people.body.meta.total_count} people`);
else bad(`People API returned ${people.status} — check PCO_APP_ID / PCO_SECRET`);

const households = await pco("/people/v2/households?per_page=1");
if (households.status === 200) ok(`households readable — ${households.body.meta.total_count} households`);
else bad(`households returned ${households.status}`);

const campuses = await pco("/people/v2/campuses?per_page=100");
if (campuses.status === 200) ok(`campuses readable — ${campuses.body.meta.total_count} campuses`);
else bad(`campuses returned ${campuses.status}`);

const webhooksApi = await pco("/webhooks/v2/subscriptions?per_page=100");
if (webhooksApi.status === 200) ok("webhooks API accessible");
else bad(`webhooks API returned ${webhooksApi.status} — token can't manage subscriptions`);

for (const [name, path] of [["Groups", "/groups/v2/groups?per_page=1"], ["Giving", "/giving/v2/funds?per_page=1"]]) {
  const r = await pco(path);
  if (r.status === 200) ok(`${name} product accessible (sync for it not built yet — flag for build-out)`);
  else wn(`${name} product not accessible (${r.status}) — ${name.toLowerCase()} sync won't be possible with this token`);
}

// --- B1 ---
console.log("\nB1 / ChurchApps:");
const b1People = await b1("/membership/people/search?term=__preflight_nomatch__");
if (b1People.status === 200) ok("B1 key valid — people:read works");
else bad(`B1 people search returned ${b1People.status} — check B1_API_KEY`);

const b1Camp = await b1("/membership/campuses");
if (b1Camp.status === 200) ok(`campuses readable — ${b1Camp.body.length} campuses in B1`);
else bad(`B1 campuses returned ${b1Camp.status}`);

// settings:write is required for campus auto-create during migration
const probe = await b1("/membership/campuses", { method: "POST", body: JSON.stringify([{ name: "__preflight_probe__" }]) });
if (probe.status === 200) {
  const id = Array.isArray(probe.body) ? probe.body[0]?.id : probe.body?.id;
  ok("campus create works (settings:write scope present)");
  if (id) await b1(`/membership/campuses/${id}`, { method: "DELETE" });
} else {
  bad(`campus create returned ${probe.status} — key lacks settings:write; campus auto-create will fail (people still sync, without campuses)`);
}

// create-then-delete a probe person to verify people:write (self-cleaning)
const personProbe = await b1("/membership/people", {
  method: "POST",
  body: JSON.stringify([{ name: { first: "Preflight", last: "Probe" } }]),
});
const probePerson = Array.isArray(personProbe.body) ? personProbe.body[0] : personProbe.body;
if (personProbe.status === 200 && probePerson?.id) {
  ok("people write works (people:write scope present)");
  const del = await b1(`/membership/people/${probePerson.id}`, { method: "DELETE" });
  if (del.status === 200) ok("people delete works (needed for PCO-delete mirroring)");
  else wn(`probe person delete returned ${del.status} — remove "Preflight Probe" (${probePerson.id}) manually`);
} else {
  bad(`people write probe returned ${personProbe.status} — key lacks people:write`);
}

// --- Deployment ---
console.log("\nDeployment:");
try {
  const res = await fetch(`${APP_URL}/api/sync/status`, {
    headers: env.CRON_SECRET ? { Authorization: `Bearer ${env.CRON_SECRET}` } : {},
  });
  if (res.status === 401) {
    wn("service reachable but status returned 401 — set CRON_SECRET in .env.local to match the deployment");
  } else if (res.status === 200) {
    const d = await res.json();
    ok(`service reachable — ${d.count} people currently mapped`);
    if (d.count > 0 && people.status === 200 && d.count > people.body.meta.total_count * 1.5) {
      wn(`mapping count (${d.count}) far exceeds PCO people count — stale mappings from a previous church? Reset before backfill (POST /api/admin/reset-mappings)`);
    }
  } else bad(`service returned ${res.status}`);
} catch (e) {
  bad(`service unreachable: ${e.message}`);
}

if (webhooksApi.status === 200) {
  const target = `${APP_URL}/api/sync/webhook`;
  const subs = webhooksApi.body.data.filter((s) => s.attributes.url === target);
  const active = subs.filter((s) => s.attributes.active);
  const NEEDED = 12;
  if (active.length >= NEEDED) ok(`${active.length}/${NEEDED} webhook subscriptions active → ${target}`);
  else if (subs.length > 0) wn(`only ${active.length}/${NEEDED} subscriptions active — run: node scripts/register-pco-webhooks.mjs ${target}`);
  else wn(`no webhook subscriptions for this URL — run: node scripts/register-pco-webhooks.mjs ${target}`);
}

console.log(`\nResult: ${pass} passed, ${warn} warnings, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
