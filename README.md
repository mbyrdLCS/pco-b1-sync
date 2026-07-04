# PCO → B1 Sync

Mirrors people from [Planning Center](https://www.planningcenter.com/) into [B1 / ChurchApps](https://b1.church/), so a church that manages its people in Planning Center can use B1 — for example as its check-in system — without re-entering anyone. Planning Center stays the source of truth; B1 is kept continuously in sync.

Built with Next.js (App Router) and deployed on Vercel with Neon Postgres.

## What it syncs

- **People** — created, updated, and deleted in B1 automatically within seconds of the change in Planning Center (via PCO webhooks), with a nightly reconciliation cron as a safety net.
- **Fields** — name, email, mobile phone, address, birthdate, anniversary, gender, marital status (derived from household/anniversary when PCO has no explicit field), membership status, medical/allergy notes (→ B1 nametag notes, so allergies print on kids' check-in tags), campus.
- **Families/households** — each PCO household becomes a B1 household with Head / Spouse / Child roles (primary contact → Head, `child: true` → Child, other adults → Spouse), so family check-in works. People in multiple PCO households are assigned their primary one (B1 supports one).
- **Campuses** — matched by name; missing B1 campuses are auto-created (requires the `settings:write` scope).

One-way only (PCO → B1). Not yet built: Groups, Giving, Notes.

## Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/sync/webhook` | POST | PCO HMAC signature | Receives PCO webhooks (person/email/phone × created/updated/destroyed) |
| `/api/sync/backfill` | POST | Bearer `CRON_SECRET` | Full mirror of every PCO person into B1 (idempotent — updates, never duplicates) |
| `/api/sync/reconcile` | GET | Bearer `CRON_SECRET` | Re-syncs people changed since last run (nightly Vercel Cron) |
| `/api/sync/status` | GET | Bearer `CRON_SECRET` | Current PCO↔B1 id mappings |
| `/api/admin/import-mapping` | POST | Bearer `CRON_SECRET` | Seed the mapping store (migrate an existing map into a fresh deployment) |
| `/api/admin/reset-mappings` | POST | Bearer `CRON_SECRET` | Clear all sync state (use when repointing at a different church) |
| `/sync` | page | secret entered in UI | Browser UI to run a backfill |

## Setup

1. **Credentials**
   - Planning Center: create a Personal Access Token at `api.planningcenteronline.com/oauth/applications` → `PCO_APP_ID` + `PCO_SECRET`.
   - B1: create an API key with scopes `people:read people:write attendance:read attendance:write groups:read groups:write settings:read settings:write` → `B1_API_KEY`.
2. **Deploy** — `vercel link`, add a Neon Postgres database from the Vercel Marketplace (injects `DATABASE_URL`), set the env vars from `.env.example` on Production, `vercel deploy --prod`.
3. **Webhooks** — `node scripts/register-pco-webhooks.mjs https://<your-app>/api/sync/webhook`, then set the printed `PCO_WEBHOOK_SECRETS` on Vercel and redeploy.
4. **Pre-flight** — `node scripts/preflight.mjs` validates credentials, scopes, product access, and webhook wiring end-to-end before any data moves.
5. **Backfill** — `curl -X POST https://<your-app>/api/sync/backfill -H "Authorization: Bearer $CRON_SECRET"`. ~1,000 people take about 15 seconds.

From then on it runs itself: webhooks handle changes in real time, the cron catches stragglers nightly.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/preflight.mjs` | Verify the whole chain before go-live (safe: read-only + self-cleaning probes) |
| `scripts/register-pco-webhooks.mjs` | Create the 9 PCO webhook subscriptions; prints the secrets to configure |
| `scripts/seed-pco.mjs` | Generate N realistic fake people in a **test** PCO org |
| `scripts/distribute-campuses.mjs` | Assign a test org's people round-robin across campuses |
| `scripts/cleanup-pco.mjs` | Bulk-delete people from a **test** PCO org |
| `scripts/import-mapping.mjs` | One-time: load a local `data/mapping.json` into the production database |

## Notes

- Deleting a person in PCO **hard-deletes** them in B1 by default (including B1-side history). Set `SYNC_DELETE_MODE=unmap` to keep B1 records on PCO deletes (recommended during pilots), or use B1's `/membership/gdpr/people/:id/anonymize` for GDPR-style scrubbing.
- Concurrent webhook deliveries for the same new person (PCO sends `person.created` and `email.created` separately) are serialized through an atomic claim in Postgres, so they can't double-create.
- B1's Person model has no external-id field, so the PCO↔B1 link lives in this service's own `people_map` table — always run `reset-mappings` before pointing an existing deployment at a different church.
- Local dev without `DATABASE_URL` stores mappings in `data/mapping.json` (gitignored).
- Changing Vercel env vars requires a redeploy to take effect.
