// Thin client for the B1 / ChurchApps public API (API-key auth).

const BASE = process.env.B1_API_BASE ?? "https://api.churchapps.org";
const KEY = process.env.B1_API_KEY;

export type B1Person = {
  id?: string;
  name: {
    first?: string | null;
    last?: string | null;
    middle?: string | null;
    nick?: string | null;
  };
  contactInfo?: {
    email?: string | null;
    mobilePhone?: string | null;
    homePhone?: string | null;
    workPhone?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  };
  birthDate?: string | null;
  anniversary?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  membershipStatus?: string | null;
  nametagNotes?: string | null;
  campusId?: string | null;
  householdId?: string | null;
  householdRole?: string | null;
};

export async function b1Fetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!KEY) throw new Error("B1_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`B1 ${init.method ?? "GET"} ${path} -> ${res.status}: ${detail}`);
  }
  return body as T;
}

/** Create (no id) or update (with id) a single person. Returns the saved record. */
export async function b1SavePerson(person: B1Person): Promise<B1Person> {
  const saved = await b1Fetch<B1Person[] | B1Person>("/membership/people", {
    method: "POST",
    body: JSON.stringify([person]),
  });
  return Array.isArray(saved) ? saved[0] : saved;
}

/** Batch create/update many people in one request. Returns saved records in input order. */
export async function b1SavePeople(people: B1Person[]): Promise<B1Person[]> {
  if (people.length === 0) return [];
  const saved = await b1Fetch<B1Person[] | B1Person>("/membership/people", {
    method: "POST",
    body: JSON.stringify(people),
  });
  return Array.isArray(saved) ? saved : [saved];
}

export async function b1DeletePerson(id: string): Promise<void> {
  await b1Fetch(`/membership/people/${id}`, { method: "DELETE" });
}

export async function b1CreateHousehold(name: string): Promise<string> {
  const saved = await b1Fetch<{ id: string }[] | { id: string }>("/membership/households", {
    method: "POST",
    body: JSON.stringify([{ name }]),
  });
  return (Array.isArray(saved) ? saved[0] : saved).id;
}

export async function b1ListCampuses(): Promise<{ id: string; name: string }[]> {
  const rows = await b1Fetch<{ id: string; name: string }[]>("/membership/campuses");
  return Array.isArray(rows) ? rows.map((r) => ({ id: r.id, name: r.name })) : [];
}

export async function b1CreateCampus(name: string): Promise<string> {
  const saved = await b1Fetch<{ id: string }[] | { id: string }>("/membership/campuses", {
    method: "POST",
    body: JSON.stringify([{ name }]),
  });
  return (Array.isArray(saved) ? saved[0] : saved).id;
}

export async function b1SearchPeople(term: string): Promise<B1Person[]> {
  return b1Fetch<B1Person[]>(
    `/membership/people/search?term=${encodeURIComponent(term)}`,
  );
}
