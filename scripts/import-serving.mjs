// Import PCO Services serving TEAMS (rosters) into B1 as groups — Tier 1 of
// serving migration. Each PCO team becomes a B1 group named
// "Team (Service Type)" categorized by service type, members linked with
// leader flags (position name contains "leader"), and the team's position
// structure preserved in the group description for later scheduling setup.
//
// Tier 2 (plans/schedules/self-signup) is deliberately NOT built — that
// design belongs with the church if/when they commit to B1 scheduling.
//
//   node scripts/import-serving.mjs           # DRY RUN — prints the plan
//   node scripts/import-serving.mjs --apply   # create groups + members in B1
//
// Runs AFTER the people migration (needs data/mapping.json). Idempotent:
// groups matched by name, existing members skipped. Teams with no assigned
// people are skipped.

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
  const out = [], inc = [];
  let url = path;
  while (url) {
    const page = await pco(url);
    out.push(...page.data);
    inc.push(...(page.included ?? []));
    url = page.links?.next ? page.links.next.replace(PCO_BASE, "") : null;
  }
  return { data: out, included: inc };
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

const serviceTypes = (await pcoAll("/services/v2/service_types?per_page=100")).data;
const plan = [];
let totalMembers = 0, mappable = 0, emptyTeams = 0;
for (const st of serviceTypes) {
  const stName = st.attributes.name.trim();
  const teams = (await pcoAll(`/services/v2/service_types/${st.id}/teams?per_page=100`)).data;
  for (const team of teams) {
    const { data: assigns, included } = await pcoAll(
      `/services/v2/teams/${team.id}/person_team_position_assignments?per_page=100&include=team_position`,
    );
    if (assigns.length === 0) { emptyTeams++; continue; }
    const posName = {};
    for (const i of included) if (i.type === "TeamPosition") posName[i.id] = i.attributes.name;

    // one row per person; leader if ANY of their positions says leader
    const byPerson = new Map();
    const positions = new Set();
    for (const a of assigns) {
      const pid = a.relationships.person.data.id;
      const pos = posName[a.relationships.team_position?.data?.id] ?? "";
      if (pos) positions.add(pos);
      const cur = byPerson.get(pid) ?? { leader: false };
      cur.leader = cur.leader || /leader/i.test(pos);
      byPerson.set(pid, cur);
    }
    totalMembers += byPerson.size;
    mappable += [...byPerson.keys()].filter((pid) => peopleMap[pid]).length;
    plan.push({
      name: `${team.attributes.name.trim()} (${stName})`.slice(0, 255),
      category: `Serving — ${stName}`.slice(0, 255),
      about: positions.size ? `Positions: ${[...positions].sort().join(", ")}` : "",
      members: [...byPerson.entries()].map(([pcoPersonId, v]) => ({ pcoPersonId, leader: v.leader })),
    });
  }
}

for (const p of plan) {
  const linked = p.members.filter((m) => peopleMap[m.pcoPersonId]).length;
  console.log(`  - ${p.name}  members: ${p.members.length} (${linked} linked, ${p.members.filter((m) => m.leader).length} leaders)`);
}
console.log(`\nTotals: ${plan.length} serving teams, ${totalMembers} memberships, ${mappable} linkable (${emptyTeams} empty teams skipped)`);
if (mappable < totalMembers * 0.5) {
  console.log("⚠️  Less than half linkable via data/mapping.json — run AFTER the people migration.");
}
if (!APPLY) process.exit(0);

const existing = new Map((((await b1("/membership/groups")) ?? [])).map((g) => [g.name?.trim().toLowerCase(), g]));
let created = 0, membersAdded = 0, membersSkipped = 0, unmapped = 0;
for (const p of plan) {
  let group = existing.get(p.name.toLowerCase());
  if (!group) {
    group = (await b1("/membership/groups", {
      method: "POST",
      body: JSON.stringify([{ name: p.name, categoryName: p.category, about: p.about, trackAttendance: false }]),
    }))[0];
    existing.set(p.name.toLowerCase(), group);
    created++;
  }
  const rows = (await b1(`/membership/groupmembers?groupId=${group.id}`)) ?? [];
  const have = new Set(rows.map((m) => m.personId));
  const toAdd = [];
  for (const m of p.members) {
    const b1Id = peopleMap[m.pcoPersonId]?.b1Id;
    if (!b1Id) { unmapped++; continue; }
    if (have.has(b1Id)) { membersSkipped++; continue; }
    toAdd.push({ groupId: group.id, personId: b1Id, leader: m.leader });
  }
  for (let i = 0; i < toAdd.length; i += 100) {
    await b1("/membership/groupmembers", { method: "POST", body: JSON.stringify(toAdd.slice(i, i + 100)) });
  }
  membersAdded += toAdd.length;
}
console.log(`\n✅ ${created} serving-team groups created, ${membersAdded} members added, ${membersSkipped} already present, ${unmapped} skipped (not in mapping)`);
