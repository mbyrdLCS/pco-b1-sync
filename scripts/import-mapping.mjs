// One-time: load data/mapping.json (from the local/file backend) into the
// production Neon Postgres, so the deployed service knows the existing
// PCO<->B1 links and won't duplicate people on its first backfill.
//
//   vercel env pull .env.production.local --environment=production
//   node scripts/import-mapping.mjs

import fs from "fs";
import { neon } from "@neondatabase/serverless";

function readEnv(file, key) {
  const text = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].replace(/^"|"$/g, "");
  }
  return null;
}

const DBURL = readEnv("../.env.production.local", "DATABASE_URL");
if (!DBURL) {
  console.error("DATABASE_URL not found in .env.production.local");
  process.exit(1);
}

const sql = neon(DBURL);
await sql`
  create table if not exists people_map (
    pco_id text primary key,
    b1_id text not null,
    pco_updated_at timestamptz,
    synced_at timestamptz not null default now()
  )
`;

const data = JSON.parse(fs.readFileSync(new URL("../data/mapping.json", import.meta.url), "utf8"));
const entries = Object.entries(data.people);
console.log(`Importing ${entries.length} mappings into prod Postgres...`);

const CHUNK = 500;
for (let i = 0; i < entries.length; i += CHUNK) {
  const slice = entries.slice(i, i + CHUNK);
  const tuples = [];
  const params = [];
  slice.forEach(([pcoId, e], j) => {
    const o = j * 3;
    tuples.push(`($${o + 1}, $${o + 2}, $${o + 3}, now())`);
    params.push(pcoId, e.b1Id, e.updatedAt ?? null);
  });
  const text =
    `insert into people_map (pco_id, b1_id, pco_updated_at, synced_at) values ` +
    tuples.join(", ") +
    ` on conflict (pco_id) do update set b1_id = excluded.b1_id, pco_updated_at = excluded.pco_updated_at, synced_at = now()`;
  await sql.query(text, params);
  console.log(`  upserted ${Math.min(i + CHUNK, entries.length)}/${entries.length}`);
}

const [{ count }] = await sql`select count(*)::int as count from people_map`;
console.log(`Done. people_map now has ${count} rows.`);
