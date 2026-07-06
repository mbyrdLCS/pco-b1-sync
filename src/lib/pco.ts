// Thin client for the Planning Center People API (Personal Access Token / Basic auth).

const BASE = process.env.PCO_API_BASE ?? "https://api.planningcenteronline.com";
const APP_ID = process.env.PCO_APP_ID;
const SECRET = process.env.PCO_SECRET;

/** A person flattened into the few fields B1 cares about. */
export type NormalizedPerson = {
  pcoId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  nickName?: string | null;
  birthdate?: string | null; // ISO datetime or null
  gender?: string | null;
  email?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
  workPhone?: string | null;
  photo?: string | null;
  primaryCampusPcoId?: string | null;
  child?: boolean;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  medicalNotes?: string | null;
  membershipStatus?: string | null;
  anniversary?: string | null; // ISO datetime or null
  status?: string;
  updatedAt?: string;
};

export type PcoHousehold = {
  id: string;
  name: string;
  primaryContactId: string | null;
  members: { personId: string; child: boolean }[];
};

type JsonApiResource = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data?: { type: string; id: string }[] | { type: string; id: string } | null }>;
};

type JsonApiResponse = {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  links?: { next?: string | null };
};

function authHeader(): string {
  const token = Buffer.from(`${APP_ID}:${SECRET}`).toString("base64");
  return `Basic ${token}`;
}

export async function pcoFetch(pathOrUrl: string): Promise<JsonApiResponse> {
  if (!APP_ID || !SECRET) throw new Error("PCO_APP_ID / PCO_SECRET are not set");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  // All PCO calls are GETs, so retrying is always safe. PCO rate-limits at
  // ~100 req/20s; webhook bursts (bulk edits in PCO) can trip it.
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    if (res.ok) return res.json();
    lastErr = `PCO ${pathOrUrl} -> ${res.status}: ${await res.text()}`;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 20;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    } else if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    } else {
      break; // 4xx other than 429: not retryable
    }
  }
  throw new Error(lastErr);
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickPrimary(
  refs: { type: string; id: string }[],
  byId: Map<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const items = refs.map((r) => byId.get(r.id)).filter(Boolean) as Record<string, unknown>[];
  return items.find((i) => i.primary === true) ?? items[0];
}

function normalize(
  p: JsonApiResource,
  emailById: Map<string, Record<string, unknown>>,
  phoneById: Map<string, Record<string, unknown>>,
  addressById: Map<string, Record<string, unknown>> = new Map(),
): NormalizedPerson {
  const a = p.attributes;
  const emailRefs = asArray(p.relationships?.emails?.data);
  const phoneRefs = asArray(p.relationships?.phone_numbers?.data);
  const addressRefs = asArray(p.relationships?.addresses?.data);
  const email = pickPrimary(emailRefs, emailById)?.address as string | undefined;
  const addr = pickPrimary(addressRefs, addressById);

  // Map phones by their PCO location so Home lines don't land in B1's mobile
  // field. Within each type, prefer the primary-flagged number.
  const phones = phoneRefs
    .map((r) => phoneById.get(r.id))
    .filter(Boolean) as Record<string, unknown>[];
  const phoneOf = (loc: string) => {
    const ofType = phones.filter((x) => x.location === loc);
    const hit = ofType.find((x) => x.primary === true) ?? ofType[0];
    return (hit?.number as string) ?? null;
  };
  const mobile = phoneOf("Mobile") ?? phoneOf("Other");

  // Real profile photos only — PCO serves generated initials for everyone else
  const avatar = (a.avatar as string) || "";
  const photo = avatar && !avatar.includes("/initials/") ? avatar : null;
  const birthdate = a.birthdate as string | null;
  const anniversary = a.anniversary as string | null;
  const campusRef = p.relationships?.primary_campus?.data;
  const primaryCampusPcoId =
    campusRef && !Array.isArray(campusRef) ? campusRef.id : null;
  return {
    pcoId: p.id,
    firstName: (a.first_name as string) ?? "",
    lastName: (a.last_name as string) ?? "",
    middleName: (a.middle_name as string) ?? null,
    nickName: (a.nickname as string) ?? null,
    birthdate: birthdate ? `${birthdate}T00:00:00.000Z` : null,
    gender: (a.gender as string) ?? null,
    email: email ?? null,
    mobilePhone: mobile,
    homePhone: phoneOf("Home"),
    workPhone: phoneOf("Work"),
    photo,
    primaryCampusPcoId,
    child: a.child === true,
    address: addr
      ? {
          line1: (addr.street_line_1 ?? addr.street ?? null) as string | null,
          line2: (addr.street_line_2 ?? null) as string | null,
          city: (addr.city ?? null) as string | null,
          state: (addr.state ?? null) as string | null,
          zip: (addr.zip ?? null) as string | null,
        }
      : null,
    medicalNotes: (a.medical_notes as string) ?? null,
    membershipStatus: (a.membership as string) ?? null,
    anniversary: anniversary ? `${anniversary}T00:00:00.000Z` : null,
    status: a.status as string | undefined,
    updatedAt: a.updated_at as string | undefined,
  };
}

/** List PCO campuses as {id, name}. */
export async function pcoListCampuses(): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let url: string | null = "/people/v2/campuses?per_page=100";
  while (url) {
    const page = await pcoFetch(url);
    for (const c of asArray(page.data)) {
      out.push({ id: c.id, name: String(c.attributes.name ?? "") });
    }
    url = page.links?.next ?? null;
  }
  return out;
}

function buildIncludeMaps(included: JsonApiResource[]) {
  const emailById = new Map<string, Record<string, unknown>>();
  const phoneById = new Map<string, Record<string, unknown>>();
  const addressById = new Map<string, Record<string, unknown>>();
  for (const inc of included) {
    if (inc.type === "Email") emailById.set(inc.id, inc.attributes);
    if (inc.type === "PhoneNumber") phoneById.set(inc.id, inc.attributes);
    if (inc.type === "Address") addressById.set(inc.id, inc.attributes);
  }
  return { emailById, phoneById, addressById };
}

/** Page through people, with primary email + phone resolved.
 *  Pass `since` (ISO timestamp) to only fetch people changed at/after that time. */
export async function pcoListAllPeople(
  opts: { since?: string } = {},
): Promise<NormalizedPerson[]> {
  const people: NormalizedPerson[] = [];
  const sinceParam = opts.since
    ? `&where[updated_at][gte]=${encodeURIComponent(opts.since)}`
    : "";
  let url: string | null =
    `/people/v2/people?per_page=100&include=emails,phone_numbers,addresses${sinceParam}`;
  while (url) {
    const page = await pcoFetch(url);
    const { emailById, phoneById, addressById } = buildIncludeMaps(page.included ?? []);
    for (const p of asArray(page.data)) {
      people.push(normalize(p, emailById, phoneById, addressById));
    }
    url = page.links?.next ?? null;
  }
  return people;
}

/** People updated at/after the given ISO timestamp (for reconciliation). */
export async function pcoListPeopleUpdatedSince(
  since: string,
): Promise<NormalizedPerson[]> {
  return pcoListAllPeople({ since });
}

/** Fetch a single person by PCO id, normalized. */
export async function pcoGetPerson(id: string): Promise<NormalizedPerson> {
  const page = await pcoFetch(
    `/people/v2/people/${id}?include=emails,phone_numbers,addresses`,
  );
  const { emailById, phoneById, addressById } = buildIncludeMaps(page.included ?? []);
  const person = asArray(page.data)[0];
  return normalize(person, emailById, phoneById, addressById);
}

/** List PCO households with their members + which member is the primary contact. */
export async function pcoListHouseholds(): Promise<PcoHousehold[]> {
  const out: PcoHousehold[] = [];
  let url: string | null = "/people/v2/households?per_page=100&include=people";
  while (url) {
    const page = await pcoFetch(url);
    const childById = new Map<string, boolean>();
    for (const inc of page.included ?? []) {
      if (inc.type === "Person") childById.set(inc.id, inc.attributes.child === true);
    }
    for (const h of asArray(page.data)) {
      const pc = h.relationships?.primary_contact?.data;
      const memberRefs = asArray(h.relationships?.people?.data);
      out.push({
        id: h.id,
        name: String(h.attributes.name ?? ""),
        primaryContactId: pc && !Array.isArray(pc) ? pc.id : null,
        members: memberRefs.map((m) => ({
          personId: m.id,
          child: childById.get(m.id) ?? false,
        })),
      });
    }
    url = page.links?.next ?? null;
  }
  return out;
}
