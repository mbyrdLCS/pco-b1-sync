import { setMappings, setHouseholdMappings } from "@/lib/mapping";
import { hasDb, setState } from "@/lib/db";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Protected admin endpoint to seed the mapping store — used to move a local
// bulk-migration's bookkeeping into the deployed database so webhooks/reconcile
// update instead of duplicate. Accepts any of:
//   entries:        [{ pcoId, b1Id, updatedAt? }]          people links
//   households:     [{ pcoHouseholdId, b1HouseholdId }]    household links
//   reconcileSince: "<ISO>"                                seeds the reconcile cursor
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  let body: {
    entries?: { pcoId?: unknown; b1Id?: unknown; updatedAt?: unknown }[];
    households?: { pcoHouseholdId?: unknown; b1HouseholdId?: unknown }[];
    reconcileSince?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const people = (Array.isArray(body.entries) ? body.entries : [])
    .filter((e) => e?.pcoId && e?.b1Id)
    .map((e) => ({
      pcoId: String(e.pcoId),
      b1Id: String(e.b1Id),
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : undefined,
    }));
  const households = (Array.isArray(body.households) ? body.households : [])
    .filter((h) => h?.pcoHouseholdId && h?.b1HouseholdId)
    .map((h) => ({
      pcoHouseholdId: String(h.pcoHouseholdId),
      b1HouseholdId: String(h.b1HouseholdId),
    }));

  await setMappings(people);
  await setHouseholdMappings(households);
  let cursorSet = false;
  if (typeof body.reconcileSince === "string" && hasDb()) {
    await setState("reconcile_since", body.reconcileSince);
    cursorSet = true;
  }

  return Response.json({
    ok: true,
    imported: { people: people.length, households: households.length, reconcileCursor: cursorSet },
  });
}
