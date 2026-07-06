// Import PCO Groups into B1: groups (with their PCO group type as the B1
// category) plus memberships with leader flags and join dates. Run AFTER the
// people migration — membership linking needs data/mapping.json.
//
//   node scripts/import-groups.mjs           # DRY RUN — prints the plan
//   node scripts/import-groups.mjs --apply   # create groups + members in B1
//
// Idempotent: groups matched by name, existing members skipped. Archived PCO
// groups are excluded. Only reads from PCO — writes go to B1 only.

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
const APPLY = process.argv.includes("--apply");

async function pco(path) {
  const res = await fetch(PCO_BASE + path, { headers: { Authorization: PCO_AUTH } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 20) * 1000));
    return pco(path);
  }
  if (!res.ok) throw new Error(`PCO ${path} -> ${res.status}`);
  return res.json();
}
async function pcoAll(path) {
  const out = [];
  let url = path;
  while (url) {
    const page = await pco(url);
    out.push(...page.data);
    url = page.links?.next ? page.links.next.replace(PCO_BASE, "") : null;
  }
  return out;
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

const mappingFile = new URL("../data/mapping.json", import.meta.url);
const peopleMap = fs.existsSync(mappingFile)
  ? JSON.parse(fs.readFileSync(mappingFile, "utf8")).people ?? {}
  : {};

console.log(APPLY ? "\nAPPLY MODE — creating in B1\n" : "\nDRY RUN — no changes will be made (use --apply to create)\n");

// group types -> category names
const typeName = {};
for (const t of await pcoAll("/groups/v2/group_types?per_page=100")) {
  typeName[t.id] = t.attributes.name.trim();
}

// groups + memberships
const groups = (await pcoAll("/groups/v2/groups?per_page=100")).filter((g) => !g.attributes.archived_at);
let totalMembers = 0, mappable = 0;
const plan = [];
for (const g of groups) {
  const gtId = g.relationships?.group_type?.data?.id;
  const members = await pcoAll(`/groups/v2/groups/${g.id}/memberships?per_page=100`);
  const rows = members.map((m) => ({
    pcoPersonId: m.relationships.person.data.id,
    leader: m.attributes.role === "leader",
    joinDate: m.attributes.joined_at ?? null,
  }));
  totalMembers += rows.length;
  mappable += rows.filter((r) => peopleMap[r.pcoPersonId]).length;
  plan.push({
    name: g.attributes.name.trim(),
    category: typeName[gtId] ?? "Groups",
    about: (g.attributes.description ?? "").slice(0, 2000),
    members: rows,
  });
}

for (const p of plan) {
  const linked = p.members.filter((m) => peopleMap[m.pcoPersonId]).length;
  console.log(`  - ${p.name}  [${p.category}]  members: ${p.members.length} (${linked} linked, ${p.members.filter((m) => m.leader).length} leaders)`);
}
console.log(`\nTotals: ${plan.length} groups, ${totalMembers} memberships, ${mappable} linkable via current mapping file`);
if (mappable < totalMembers * 0.5) {
  console.log("⚠️  Less than half the members are in data/mapping.json — run this AFTER the people migration.");
}
if (!APPLY) process.exit(0);

// APPLY
const existingGroups = new Map(((await b1("/membership/groups")) ?? []).map((g) => [g.name?.trim().toLowerCase(), g]));
let created = 0, membersAdded = 0, membersSkipped = 0, unmappedSkipped = 0;
for (const p of plan) {
  let group = existingGroups.get(p.name.toLowerCase());
  if (!group) {
    group = (await b1("/membership/groups", {
      method: "POST",
      body: JSON.stringify([{ name: p.name, categoryName: p.category, about: p.about, trackAttendance: true }]),
    }))[0];
    existingGroups.set(p.name.toLowerCase(), group);
    created++;
  }
  const existing = new Set((((await b1(`/membership/groupmembers?groupId=${group.id}`)) ?? [])).map((m) => m.personId));
  const toAdd = [];
  for (const m of p.members) {
    const b1Id = peopleMap[m.pcoPersonId]?.b1Id;
    if (!b1Id) { unmappedSkipped++; continue; }
    if (existing.has(b1Id)) { membersSkipped++; continue; }
    toAdd.push({ groupId: group.id, personId: b1Id, leader: m.leader, joinDate: m.joinDate });
  }
  for (let i = 0; i < toAdd.length; i += 100) {
    await b1("/membership/groupmembers", { method: "POST", body: JSON.stringify(toAdd.slice(i, i + 100)) });
  }
  membersAdded += toAdd.length;
}
console.log(`\n✅ ${created} groups created, ${membersAdded} members added, ${membersSkipped} already present, ${unmappedSkipped} skipped (person not in mapping — re-run after migration)`);
