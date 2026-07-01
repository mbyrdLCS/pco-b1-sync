import { pcoListPeopleUpdatedSince } from "@/lib/pco";
import { syncPeople } from "@/lib/sync";
import { hasDb, getState, setState } from "@/lib/db";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nightly safety-net (Vercel Cron). Re-syncs every PCO person changed since the
// last run, catching anything a webhook missed. Deletes are handled by the
// webhook (person.destroyed); this job covers creates/updates.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();

  const startedAt = Date.now();
  // Look back from the last cursor; overlap 10 min for safety (re-sync is idempotent).
  const stored = hasDb() ? await getState("reconcile_since") : null;
  const cutoff = stored ?? "1970-01-01T00:00:00Z";

  const people = await pcoListPeopleUpdatedSince(cutoff);
  const summary = await syncPeople(people);

  if (hasDb()) {
    const nextCursor = new Date(startedAt - 10 * 60 * 1000).toISOString();
    await setState("reconcile_since", nextCursor);
  }

  return Response.json({
    ok: true,
    since: cutoff,
    processed: summary.total,
    created: summary.created,
    updated: summary.updated,
    failed: summary.failed,
    elapsedMs: Date.now() - startedAt,
  });
}
