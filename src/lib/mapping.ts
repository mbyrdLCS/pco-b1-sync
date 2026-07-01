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
export async function getB1Id(pcoId: string): Promise<string | null> {
  if (hasDb()) {
    await ensureSchema();
    const rows = (await getSql()`select b1_id from people_map where pco_id = ${pcoId}`) as {
      b1_id: string;
    }[];
    return rows[0]?.b1_id ?? null;
  }
  const d = await fileRead();
  return d.people[pcoId]?.b1Id ?? null;
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
  if (hasDb()) {
    await ensureSchema();
    await getSql()`
      insert into household_map (pco_household_id, b1_household_id, synced_at)
      values (${pcoHouseholdId}, ${b1HouseholdId}, now())
      on conflict (pco_household_id) do update set b1_household_id = excluded.b1_household_id, synced_at = now()
    `;
    return;
  }
  const d = await fileRead();
  d.households = d.households ?? {};
  d.households[pcoHouseholdId] = b1HouseholdId;
  await fileWrite(d);
}
