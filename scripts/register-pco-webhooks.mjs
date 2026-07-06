// Register Planning Center webhook subscriptions that point at the deployed
// sync service. Run once after deploying (and again if the URL changes).
//
//   node scripts/register-pco-webhooks.mjs https://YOUR-APP.vercel.app/api/sync/webhook
//
// Prints each subscription's authenticity_secret — collect them into the
// PCO_WEBHOOK_SECRETS env var (comma-separated) so the receiver can verify
// signatures.

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const AUTH = "Basic " + Buffer.from(`${env.PCO_APP_ID}:${env.PCO_SECRET}`).toString("base64");

const URL_TARGET = process.argv[2];
if (!URL_TARGET || !URL_TARGET.startsWith("http")) {
  console.error("Usage: node scripts/register-pco-webhooks.mjs <https://app/api/sync/webhook>");
  process.exit(1);
}

const EVENTS = [
  "people.v2.events.person.created",
  "people.v2.events.person.updated",
  "people.v2.events.person.destroyed",
  "people.v2.events.email.created",
  "people.v2.events.email.updated",
  "people.v2.events.email.destroyed",
  "people.v2.events.phone_number.created",
  "people.v2.events.phone_number.updated",
  "people.v2.events.phone_number.destroyed",
  "people.v2.events.household.created",
  "people.v2.events.household.updated",
  "people.v2.events.household.destroyed",
];

async function pco(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return json;
}

// existing subscriptions (avoid duplicates for same name+url)
const existing = await pco("GET", "/webhooks/v2/subscriptions?per_page=100");
const have = new Set(
  (existing.data ?? []).map((s) => `${s.attributes.name}|${s.attributes.url}`),
);

const secrets = [];
for (const name of EVENTS) {
  if (have.has(`${name}|${URL_TARGET}`)) {
    console.log(`= exists  ${name}`);
    const s = existing.data.find(
      (x) => x.attributes.name === name && x.attributes.url === URL_TARGET,
    );
    if (s?.attributes?.authenticity_secret) secrets.push(s.attributes.authenticity_secret);
    continue;
  }
  try {
    const created = await pco("POST", "/webhooks/v2/subscriptions", {
      data: { type: "WebhookSubscription", attributes: { name, url: URL_TARGET, active: true } },
    });
    const secret = created.data?.attributes?.authenticity_secret;
    if (secret) secrets.push(secret);
    console.log(`+ created ${name}`);
  } catch (e) {
    console.error(`! failed  ${name}: ${e.message}`);
  }
}

const unique = [...new Set(secrets)];
console.log("\n--- Set this env var on the deployment ---");
console.log(`PCO_WEBHOOK_SECRETS=${unique.join(",")}`);
