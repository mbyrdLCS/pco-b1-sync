// Bearer-token check for operational endpoints (backfill, status, reconcile,
// admin). Uses CRON_SECRET so Vercel Cron's built-in Authorization header and
// human/tool calls share one secret. Deny when unconfigured — this service
// syncs real church data and must not expose unauthenticated triggers.

export function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
