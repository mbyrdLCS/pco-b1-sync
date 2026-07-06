// Import real profile photos from PCO into B1, one-time, AFTER the people
// migration. Kept separate from the sync because B1 re-hosts photos sent as
// base64 data URLs (and crashes on photo:null), and thousands of image
// downloads don't belong inside the people backfill.
//
//   node scripts/import-photos.mjs           # resumable; skips already-done
//   node scripts/import-photos.mjs --force   # redo even if B1 already has a photo
//
// Requires data/mapping.json (produced by the migration) for pcoId -> b1Id.

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const PCO_BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const B1_BASE = env.B1_API_BASE || "https://api.churchapps.org";
const PCO_AUTH = "Basic " + Buffer.from(`${env.PCO_APP_ID}:${env.PCO_SECRET}`).toString("base64");
const FORCE = process.argv.includes("--force");

const mapping = JSON.parse(fs.readFileSync(new URL("../data/mapping.json", import.meta.url), "utf8")).people;
const DONE_PATH = new URL("../data/photos-done.json", import.meta.url);
const done = new Set(fs.existsSync(DONE_PATH) ? JSON.parse(fs.readFileSync(DONE_PATH, "utf8")) : []);
const saveDone = () => fs.writeFileSync(DONE_PATH, JSON.stringify([...done]));

async function pco(path) {
  const res = await fetch(PCO_BASE + path, { headers: { Authorization: PCO_AUTH } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 20) * 1000));
    return pco(path);
  }
  if (!res.ok) throw new Error(`PCO ${path} -> ${res.status}`);
  return res.json();
}
async function b1(path, init = {}) {
  const res = await fetch(B1_BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.B1_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`B1 ${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 150)}`);
  return text ? JSON.parse(text) : null;
}

// collect everyone with a real (non-initials) avatar
console.log("Scanning PCO for real profile photos...");
const targets = [];
let url = "/people/v2/people?per_page=100";
while (url) {
  const page = await pco(url);
  for (const p of page.data) {
    const avatar = p.attributes.avatar || "";
    if (avatar && !avatar.includes("/initials/") && mapping[p.id]) {
      targets.push({ pcoId: p.id, b1Id: mapping[p.id].b1Id, avatar, name: p.attributes.name });
    }
  }
  url = page.links?.next ? page.links.next.replace(PCO_BASE, "") : null;
}
const todo = targets.filter((t) => !done.has(t.pcoId));
console.log(`${targets.length} people with photos; ${todo.length} to import (${done.size} already done)`);

let ok = 0, skip = 0, fail = 0, processed = 0;
const CONCURRENCY = 4;
const queue = [...todo];

async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      // B1 saves are whole-record: fetch, modify photo only, save back
      const person = await b1(`/membership/people/${t.b1Id}`);
      if (!person?.id) { fail++; continue; }
      if (person.photo && !FORCE) { skip++; done.add(t.pcoId); continue; }

      const img = await fetch(t.avatar);
      if (!img.ok) { fail++; continue; }
      const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
      // B1 only processes the data-URL form (prefix must be data:image/png;base64,)
      person.photo = `data:image/png;base64,${b64}`;
      await b1("/membership/people", { method: "POST", body: JSON.stringify([person]) });
      done.add(t.pcoId); ok++;
    } catch (e) {
      fail++;
      if (fail <= 5) console.error(`  ERR ${t.name}: ${e.message}`);
    }
    processed++;
    if (processed % 100 === 0) { saveDone(); console.log(`  ${processed}/${todo.length} (ok ${ok}, skipped ${skip}, failed ${fail})`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
saveDone();
console.log(`DONE: ${ok} photos imported, ${skip} skipped (already had one), ${fail} failed. Re-run to retry failures.`);
