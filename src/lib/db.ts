// Neon Postgres connection + schema. Only used when DATABASE_URL is set
// (production / Vercel). Local dev without a DATABASE_URL uses the JSON file
// backend in mapping.ts instead.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}

let _sql: NeonQueryFunction<false, false> | null = null;
export function getSql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

let _schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists people_map (
          pco_id text primary key,
          b1_id text not null,
          pco_updated_at timestamptz,
          synced_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists sync_state (
          key text primary key,
          value text
        )
      `;
      await sql`
        create table if not exists household_map (
          pco_household_id text primary key,
          b1_household_id text not null,
          synced_at timestamptz not null default now()
        )
      `;
    })();
  }
  return _schemaReady;
}

/** Small key/value store for sync cursors (e.g. last reconcile time). */
export async function getState(key: string): Promise<string | null> {
  await ensureSchema();
  const rows = (await getSql()`select value from sync_state where key = ${key}`) as {
    value: string;
  }[];
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await ensureSchema();
  await getSql()`
    insert into sync_state (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value
  `;
}
