import crypto from "crypto";
import { syncPersonById, deletePersonByPcoId } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receiver for Planning Center People webhooks. Subscribe to person, email and
// phone_number events (created/updated/destroyed). Adding an email in PCO fires
// an `email.created` event (not `person.updated`), so we resolve every event
// back to a person id and re-sync that person.

function configuredSecrets(): string[] {
  const many = (process.env.PCO_WEBHOOK_SECRETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const one = process.env.PCO_WEBHOOK_SECRET?.trim();
  return one ? [one, ...many] : many;
}

function signatureValid(rawBody: string, provided: string | null): boolean {
  const secrets = configuredSecrets();
  if (secrets.length === 0) return true; // verification disabled (dev)
  if (!provided) return false;
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    // timing-safe compare; lengths must match
    return (
      expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    );
  });
}

// Pull the affected person id out of a single event's inner payload.
// Person events -> data.id; Email/PhoneNumber/Address events -> person relationship.
function personIdFromPayload(inner: {
  data?: {
    type?: string;
    id?: string;
    relationships?: { person?: { data?: { id?: string } } };
  };
}): string | undefined {
  const d = inner?.data;
  if (!d) return undefined;
  if (d.type === "Person") return d.id;
  return d.relationships?.person?.data?.id;
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!signatureValid(raw, req.headers.get("x-pco-webhooks-authenticity"))) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let envelope: { data?: { attributes?: { name?: string; payload?: string } }[] };
  try {
    envelope = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const results: unknown[] = [];
  for (const event of envelope.data ?? []) {
    const name = event.attributes?.name ?? "";
    let personId: string | undefined;
    try {
      personId = personIdFromPayload(JSON.parse(event.attributes?.payload ?? "{}"));
    } catch {
      // malformed inner payload — skip
    }
    if (!personId) continue;

    try {
      // A *person* destroyed in PCO -> delete the mirrored person in B1.
      // A destroyed email/phone just means the person changed -> re-sync them.
      const isPersonDestroy = name.includes("person") && name.includes("destroy");
      if (isPersonDestroy) {
        results.push({ ...(await deletePersonByPcoId(personId)), event: name });
      } else {
        results.push({ ...(await syncPersonById(personId)), event: name });
      }
    } catch (e) {
      results.push({ personId, event: name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ ok: true, handled: results.length, results });
}
