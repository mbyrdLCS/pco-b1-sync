// Populate the Planning Center test org with realistic simulated people.
//
//   node scripts/seed-pco.mjs [count] [runTag]
//
// Each person gets a name, usually a birthdate/gender, an email, and ~60% a
// mobile phone. Every generated person is stamped with remote_id "<runTag>-<i>"
// so the simulated set can be identified and cleaned up later.

import fs from "fs";

// --- load .env.local (this is a plain node script, not Next) ---
const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const APP_ID = env.PCO_APP_ID;
const SECRET = env.PCO_SECRET;
if (!APP_ID || !SECRET) {
  console.error("Missing PCO_APP_ID / PCO_SECRET in .env.local");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`${APP_ID}:${SECRET}`).toString("base64");

const N = parseInt(process.argv[2] || "1000", 10);
const RUN_TAG = process.argv[3] || `sim${Date.now()}`;
const CONCURRENCY = 6;

const FIRST = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph",
  "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Nancy", "Matthew",
  "Lisa", "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra", "Steven",
  "Ashley", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna", "Kenneth",
  "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward",
  "Deborah", "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon",
  "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
  "Nicholas", "Angela", "Eric", "Shirley", "Jonathan", "Anna", "Stephen", "Ruth",
];
const LAST = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts",
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
function randomBirthdate() {
  const year = rand(1945, 2018);
  return `${year}-${pad(rand(1, 12))}-${pad(rand(1, 28))}`;
}

// --- rate limiter: stay under ~90 requests / 20s ---
let stamps = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < 20000);
    if (stamps.length < 90) {
      stamps.push(now);
      return;
    }
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
    if (res.status === 429) {
      const ra = parseInt(res.headers.get("retry-after") || "20", 10);
      await sleep((ra + 1) * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`${method} ${path} failed after retries`);
}

async function createPerson(i) {
  const first = pick(FIRST);
  const last = pick(LAST);
  // Note: simulated people are identifiable by their @simchurch.org email domain
  // (PCO's remote_id only accepts integers, so we don't use it as a tag).
  const attributes = { first_name: first, last_name: last };
  if (Math.random() < 0.85) attributes.birthdate = randomBirthdate();
  if (Math.random() < 0.92) attributes.gender = Math.random() < 0.5 ? "Male" : "Female";

  const person = await pco("POST", "/people/v2/people", {
    data: { type: "Person", attributes },
  });
  const id = person.data.id;

  const email = `${first}.${last}.${i}@simchurch.org`.toLowerCase();
  await pco("POST", `/people/v2/people/${id}/emails`, {
    data: { type: "Email", attributes: { address: email, location: "Home", primary: true } },
  });

  if (Math.random() < 0.6) {
    const phone = `(${rand(201, 989)}) ${rand(201, 999)}-${rand(1000, 9999)}`;
    await pco("POST", `/people/v2/people/${id}/phone_numbers`, {
      data: { type: "PhoneNumber", attributes: { number: phone, location: "Mobile", primary: true } },
    });
  }
  return id;
}

let done = 0;
let failed = 0;
const queue = Array.from({ length: N }, (_, i) => i);

async function worker() {
  while (queue.length) {
    const i = queue.shift();
    try {
      await createPerson(i);
    } catch (e) {
      failed++;
      if (failed <= 10) console.error("ERR", e.message);
    }
    done++;
    if (done % 50 === 0 || done === N) {
      console.log(`${done}/${N} created (failed ${failed})`);
    }
  }
}

console.log(`Seeding ${N} people into PCO, runTag=${RUN_TAG}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`DONE: created ${done - failed}/${N}, failed ${failed}, runTag=${RUN_TAG}`);
