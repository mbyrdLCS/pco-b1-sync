// Persistent PCO-id <-> B1-id mapping.
//
// Backend is chosen at runtime:
//   - DATABASE_URL set  -> Neon Postgres (production / Vercel)
//   - otherwise         -> local JSON file (dev convenience)

import { promises as fs } from "fs";
import path from "path";
import { hasDb, getSql, ensureSchema } from "./db";

export type MappingEntry = {
  b1Id: string;
  updatedAt?: string;
  syncedAt: string;
};

// ---------------------------------------------------------------------------
// File backend
// ---------------------------------------------------------------------------
const FILE = path.join(process.cwd(), "data", "mapping.json");

type FileData = {
  people: Record<string, MappingEntry>;
  households?: Record<string, string>;
};

async function fileRead(): Promise<FileData> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return { people: {} };
  }
}

async function fileWrite(data: FileData) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Public API (dispatches to the active backend)
// ---------------------------------------------------------------------------
// Sentinel marking "creation in flight" — used to serialize concurrent creates
// (PCO fires person.created + email.created as separate near-simultaneous
// webhook deliveries; without a claim, both would create the person in B1).
const PENDING = "__pending__";

export async function getB1Id(pcoId: string): Promise<string | null> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`select b1_id from people_map where pco_id = ${pcoId}`) as {
      b1_id: string;
    }[];
    const id = rows[0]?.b1_id ?? null;
    return id === PENDING ? null : id;
  }
  const d = await fileRead();
  const id = d.people[pcoId]?.b1Id ?? null;
  return id === PENDING ? null : id;
}

/** Atomically claim the right to CREATE this person in B1.
 *  Returns "claimed" if we won (proceed to create), "exists" if another
 *  invocation holds the claim or the mapping already exists. */
export async function claimCreate(pcoId: string): Promise<"claimed" | "exists"> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`
      insert into people_map (pco_id, b1_id, synced_at) values (${pcoId}, ${PENDING}, now())
      on conflict (pco_id) do nothing
      returning pco_id
    `) as { pco_id: string }[];
    return rows.length > 0 ? "claimed" : "exists";
  }
  // file backend is local single-process dev — no real concurrency to guard
  const d = await fileRead();
  return d.people[pcoId] ? "exists" : "claimed";
}

/** Undo a claim after a failed create so a later attempt can retry. */
export async function releaseClaim(pcoId: string): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await getSql()`delete from people_map where pco_id = ${pcoId} and b1_id = ${PENDING}`;
  }
}

/** Wait for a concurrent invocation's create to land; returns the real B1 id or null. */
export async function waitForMapping(pcoId: string, tries = 12): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const id = await getB1Id(pcoId);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function setMapping(
  pcoId: string,
  b1Id: string,
  updatedAt?: string,
): Promise<void> {
  await setMappings([{ pcoId, b1Id, updatedAt }]);
}

/** Apply many mappings efficiently (single DB statement set / single file write). */
export async function setMappings(
  entries: { pcoId: string; b1Id: string; updatedAt?: string }[],
): Promise<void> {
  if (entries.length === 0) return;

  if (hasDb()) {
    await ensureSchema();
    const sql = getSql();
    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const tuples: string[] = [];
      const params: (string | null)[] = [];
      slice.forEach((e, j) => {
        const o = j * 3;
        tuples.push(`($${o + 1}, $${o + 2}, $${o + 3}, now())`);
        params.push(e.pcoId, e.b1Id, e.updatedAt ?? null);
      });
      const text =
        `insert into people_map (pco_id, b1_id, pco_updated_at, synced_at) values ` +
        tuples.join(", ") +
        ` on conflict (pco_id) do update set ` +
        `b1_id = excluded.b1_id, pco_updated_at = excluded.pco_updated_at, synced_at = now()`;
      await sql.query(text, params);
    }
    return;
  }

  const d = await fileRead();
  const syncedAt = new Date().toISOString();
  for (const e of entries) {
    d.people[e.pcoId] = { b1Id: e.b1Id, updatedAt: e.updatedAt, syncedAt };
  }
  await fileWrite(d);
}

export async function removeMapping(pcoId: string): Promise<void> {
  if (hasDb()) {
    await ensureSchema();
    await getSql()`delete from people_map where pco_id = ${pcoId}`;
    return;
  }
  const d = await fileRead();
  delete d.people[pcoId];
  await fileWrite(d);
}

export async function allMappings(): Promise<Record<string, MappingEntry>> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`select pco_id, b1_id, pco_updated_at, synced_at from people_map`) as {
      pco_id: string;
      b1_id: string;
      pco_updated_at: string | null;
      synced_at: string;
    }[];
    const out: Record<string, MappingEntry> = {};
    for (const r of rows) {
      if (r.b1_id === PENDING) continue; // in-flight claim, not a real mapping
      out[r.pco_id] = {
        b1Id: r.b1_id,
        updatedAt: r.pco_updated_at ?? undefined,
        syncedAt: r.synced_at,
      };
    }
    return out;
  }
  const d = await fileRead();
  return d.people;
}

// --- Household id map (PCO household id -> B1 household id) ---
export async function getHouseholdB1Id(pcoHouseholdId: string): Promise<string | null> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`select b1_household_id from household_map where pco_household_id = ${pcoHouseholdId}`) as {
      b1_household_id: string;
    }[];
    return rows[0]?.b1_household_id ?? null;
  }
  const d = await fileRead();
  return d.households?.[pcoHouseholdId] ?? null;
}

export async function setHouseholdMapping(
  pcoHouseholdId: string,
  b1HouseholdId: string,
): Promise<void> {
  await setHouseholdMappings([{ pcoHouseholdId, b1HouseholdId }]);
}

/** Bulk household mapping upsert (single statement set / single file write). */
export async function setHouseholdMappings(
  entries: { pcoHouseholdId: string; b1HouseholdId: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  if (hasDb()) {
    await ensureSchema();
    const sql = getSql();
    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const tuples: string[] = [];
      const params: string[] = [];
      slice.forEach((e, j) => {
        tuples.push(`($${j * 2 + 1}, $${j * 2 + 2}, now())`);
        params.push(e.pcoHouseholdId, e.b1HouseholdId);
      });
      await sql.query(
        `insert into household_map (pco_household_id, b1_household_id, synced_at) values ` +
          tuples.join(", ") +
          ` on conflict (pco_household_id) do update set b1_household_id = excluded.b1_household_id, synced_at = now()`,
        params,
      );
    }
    return;
  }
  const d = await fileRead();
  d.households = d.households ?? {};
  for (const e of entries) d.households[e.pcoHouseholdId] = e.b1HouseholdId;
  await fileWrite(d);
}

/** All household mappings at once (for bulk backfill lookups). */
export async function allHouseholdMappings(): Promise<Record<string, string>> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`select pco_household_id, b1_household_id from household_map`) as {
      pco_household_id: string;
      b1_household_id: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.pco_household_id, r.b1_household_id]));
  }
  const d = await fileRead();
  return d.households ?? {};
}
