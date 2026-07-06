// Build a church's B1 check-in structure from their PCO Check-Ins setup.
//
//   node scripts/setup-checkin.mjs            # DRY RUN — prints the plan, creates nothing
//   node scripts/setup-checkin.mjs --apply    # actually create in B1
//
// Reads active weekly PCO Check-Ins events + their locations (classrooms) and
// creates the B1 equivalents:
//   PCO campus              -> B1 campus            (created if missing)
//   event minus its time    -> B1 service           ("Northside Kids")
//   the time in the name    -> B1 serviceTime       ("9:00am")
//   event locations         -> B1 groups            ("Nursery (Northside)", ages in about)
//   location@time           -> B1 groupServiceTimes (links rooms to times)
//
// Idempotent: existing campuses/services/times/groups are matched by name and
// reused; only missing pieces are created. Events with "TEST" in the name are
// skipped. Only reads from PCO — writes go to B1 only.

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
  if (!res.ok) throw new Error(`PCO ${path} -> ${res.status}`);
  return res.json();
}
async function b1json(path, init = {}) {
  const res = await fetch(B1_BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.B1_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`B1 ${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const TIME_RE = /(\d{1,2}[:.]\d{2}\s*(?:am|pm)|\d{1,2}\s*(?:am|pm))/i;

function ageLabel(a) {
  const parts = [];
  if (a.age_min_in_months != null || a.age_max_in_months != null) {
    parts.push(`${a.age_min_in_months ?? "?"}-${a.age_max_in_months ?? "?"} months`);
  }
  if (a.grade_min != null || a.grade_max != null) {
    const g = (n) => (n === -1 ? "PreK" : n === 0 ? "K" : `Grade ${n}`);
    parts.push(`${g(a.grade_min)} to ${g(a.grade_max)}`);
  }
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
console.log(APPLY ? "\nAPPLY MODE — creating in B1\n" : "\nDRY RUN — no changes will be made (use --apply to create)\n");

// 1. PCO campuses -> matching tokens
const pcoCampuses = (await pco("/people/v2/campuses?per_page=100")).data.map((c) => {
  const name = c.attributes.name.trim();
  const key = name.toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(?:campus|outpost|site|location|service)\b/g, "").trim();
  return { name, words: key.split(/\s+/).filter(Boolean) };
});

// 2. active weekly check-in events (paginated — orgs can have hundreds)
const allEvents = [];
let evUrl = "/check-ins/v2/events?per_page=100";
while (evUrl) {
  const page = await pco(evUrl);
  allEvents.push(...page.data);
  evUrl = page.links?.next ? page.links.next.replace(PCO_BASE, "") : null;
}
const events = allEvents
  .filter((e) => !e.attributes.archived_at && e.attributes.frequency === "Weekly")
  .filter((e) => !/test/i.test(e.attributes.name))
  .map((e) => ({ id: e.id, name: e.attributes.name.trim() }));

// 3. map each event -> campus, service name, time name
const unmatched = [];
const plan = new Map(); // campusName -> Map(serviceName -> {times:Set, rooms:Map(name->about)})
for (const ev of events) {
  const lower = ev.name.toLowerCase();
  let best = null, bestScore = 0;
  for (const c of pcoCampuses) {
    const score = c.words.filter((w) => lower.includes(w)).length;
    if (score > bestScore || (score === bestScore && score > 0 && best && c.words.length > best.words.length)) {
      best = c; bestScore = score;
    }
  }
  if (!best || bestScore === 0) { unmatched.push(ev.name); continue; }

  const timeMatch = ev.name.match(TIME_RE);
  const timeName = timeMatch ? timeMatch[1].replace(/\s+/g, "").toLowerCase() : "Service";
  const serviceName = ev.name.replace(TIME_RE, "").replace(/[-–]\s*$/, "").replace(/\s{2,}/g, " ").trim() || ev.name;

  if (!plan.has(best.name)) plan.set(best.name, new Map());
  const services = plan.get(best.name);
  if (!services.has(serviceName)) services.set(serviceName, { times: new Set(), rooms: new Map() });
  const svc = services.get(serviceName);
  svc.times.add(timeName);

  const locs = (await pco(`/check-ins/v2/events/${ev.id}/locations?per_page=100`)).data;
  for (const l of locs) {
    if (l.attributes.kind !== "Location") continue;
    svc.rooms.set(l.attributes.name.trim(), ageLabel(l.attributes));
  }
}

// 4. print the plan
let nSvc = 0, nTime = 0, nRoom = 0;
for (const [campus, services] of plan) {
  console.log(`📍 ${campus}`);
  for (const [svcName, svc] of services) {
    nSvc++;
    console.log(`   └─ Service: ${svcName}`);
    for (const t of svc.times) { nTime++; console.log(`       ├─ Time: ${t}`); }
    for (const [room, ages] of svc.rooms) { nRoom++; console.log(`       └─ Room: ${room}${ages ? `  (${ages})` : ""}`); }
  }
}
console.log(`\nTotals: ${plan.size} campuses, ${nSvc} services, ${nTime} service times, ${nRoom} rooms`);
if (unmatched.length) console.log(`⚠️  Unmatched events (no campus found, skipped): ${unmatched.join(" | ")}`);
if (!APPLY) process.exit(0);

// ---------------------------------------------------------------------------
// 5. APPLY: create in B1, reusing anything that already exists (matched by name)
const existingCampuses = await b1json("/membership/campuses");
const existingServices = await b1json("/attendance/services");
const existingTimes = await b1json("/attendance/servicetimes");
const existingGroups = await b1json("/membership/groups");
const existingGst = await b1json("/attendance/groupservicetimes");
const byName = (arr) => new Map((arr ?? []).map((x) => [x.name?.trim().toLowerCase(), x]));
const campusIdx = byName(existingCampuses), svcIdx = new Map(), timeIdx = new Map(), groupIdx = byName(existingGroups);
(existingServices ?? []).forEach((s) => svcIdx.set(`${s.campusId}|${s.name?.trim().toLowerCase()}`, s));
(existingTimes ?? []).forEach((t) => timeIdx.set(`${t.serviceId}|${t.name?.trim().toLowerCase()}`, t));
const gstSet = new Set((existingGst ?? []).map((g) => `${g.groupId}|${g.serviceTimeId}`));

let created = { campuses: 0, services: 0, times: 0, groups: 0, links: 0 };
for (const [campusName, services] of plan) {
  let campus = campusIdx.get(campusName.toLowerCase());
  if (!campus) {
    campus = (await b1json("/membership/campuses", { method: "POST", body: JSON.stringify([{ name: campusName }]) }))[0];
    campusIdx.set(campusName.toLowerCase(), campus); created.campuses++;
  }
  const campusShort = campusName.split(/\s+/)[0];

  for (const [svcName, svc] of services) {
    let service = svcIdx.get(`${campus.id}|${svcName.toLowerCase()}`);
    if (!service) {
      service = (await b1json("/attendance/services", { method: "POST", body: JSON.stringify([{ campusId: campus.id, name: svcName }]) }))[0];
      svcIdx.set(`${campus.id}|${svcName.toLowerCase()}`, service); created.services++;
    }

    const timeIds = [];
    for (const t of svc.times) {
      let st = timeIdx.get(`${service.id}|${t.toLowerCase()}`);
      if (!st) {
        st = (await b1json("/attendance/servicetimes", { method: "POST", body: JSON.stringify([{ serviceId: service.id, name: t }]) }))[0];
        timeIdx.set(`${service.id}|${t.toLowerCase()}`, st); created.times++;
      }
      timeIds.push(st.id);
    }

    for (const [room, ages] of svc.rooms) {
      const groupName = `${room} (${campusShort})`;
      let group = groupIdx.get(groupName.toLowerCase());
      if (!group) {
        group = (await b1json("/membership/groups", {
          method: "POST",
          body: JSON.stringify([{ name: groupName, categoryName: svcName, trackAttendance: true, printNametag: true, parentPickup: true, about: ages || "", tags: "checkin" }]),
        }))[0];
        groupIdx.set(groupName.toLowerCase(), group); created.groups++;
      }
      for (const stId of timeIds) {
        if (gstSet.has(`${group.id}|${stId}`)) continue;
        await b1json("/attendance/groupservicetimes", { method: "POST", body: JSON.stringify([{ groupId: group.id, serviceTimeId: stId }]) });
        gstSet.add(`${group.id}|${stId}`); created.links++;
      }
    }
  }
}
console.log(`\n✅ Created: ${created.campuses} campuses, ${created.services} services, ${created.times} times, ${created.groups} groups, ${created.links} room-time links (existing items reused)`);
