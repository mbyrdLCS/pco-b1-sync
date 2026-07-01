import { backfillAll } from "@/lib/sync";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sync/backfill — pull every PCO person and upsert into B1.
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  try {
    const summary = await backfillAll();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
