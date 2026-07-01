import { hasDb, getSql, ensureSchema } from "@/lib/db";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected admin endpoint: clear ALL sync state (people/household mappings and
// the reconcile cursor). Use when repointing the service at a different church
// so the new backfill starts clean instead of updating the old church's B1 ids.
// Does NOT touch any data in PCO or B1 — only this service's own bookkeeping.
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  if (!hasDb()) {
    return Response.json(
      { ok: false, error: "no database configured (local file backend — delete data/mapping.json instead)" },
      { status: 400 },
    );
  }

  await ensureSchema();
  const sql = getSql();
  const [{ count: peopleCount }] = (await sql`select count(*)::int as count from people_map`) as { count: number }[];
  const [{ count: householdCount }] = (await sql`select count(*)::int as count from household_map`) as { count: number }[];
  await sql`delete from people_map`;
  await sql`delete from household_map`;
  await sql`delete from sync_state`;

  return Response.json({ ok: true, cleared: { people: peopleCount, households: householdCount } });
}
