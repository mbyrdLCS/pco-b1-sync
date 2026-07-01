import { allMappings } from "@/lib/mapping";
import { authorized, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/status — current PCO->B1 id mappings.
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const mappings = await allMappings();
  return Response.json({ count: Object.keys(mappings).length, mappings });
}
