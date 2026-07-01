import { setMappings } from "@/lib/mapping";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected admin endpoint to seed the mapping store (e.g. migrate an existing
// PCO<->B1 map into a fresh deployment so its first backfill updates rather
// than duplicates). Body: { entries: [{ pcoId, b1Id, updatedAt? }] }.
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  let body: { entries?: { pcoId?: unknown; b1Id?: unknown; updatedAt?: unknown }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const clean = (Array.isArray(body.entries) ? body.entries : [])
    .filter((e) => e?.pcoId && e?.b1Id)
    .map((e) => ({
      pcoId: String(e.pcoId),
      b1Id: String(e.b1Id),
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : undefined,
    }));

  await setMappings(clean);
  return Response.json({ ok: true, imported: clean.length });
}
