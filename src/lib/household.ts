// Maps PCO households -> B1 households and resolves each person's household +
// role. PCO allows a person in multiple households; B1 allows one, so we pick
// the person's "main" household (prefer the one they're primary contact of,
// then the largest).

import { pcoListHouseholds, pcoFetch, type PcoHousehold } from "./pco";
import { b1CreateHousehold } from "./b1";
import { getHouseholdB1Id, setHouseholdMapping } from "./mapping";

export type HouseholdAssignment = {
  b1HouseholdId: string;
  role: string;
  maritalStatus?: string;
};

function cleanName(name: string): string {
  const stripped = name.replace(/\s+household$/i, "").trim();
  return stripped || name || "Household";
}

/** Find-or-create the B1 household for a PCO household id; persists the mapping. */
async function ensureB1Household(pcoHouseholdId: string, name: string): Promise<string> {
  const existing = await getHouseholdB1Id(pcoHouseholdId);
  if (existing) return existing;
  const b1Id = await b1CreateHousehold(cleanName(name));
  await setHouseholdMapping(pcoHouseholdId, b1Id);
  return b1Id;
}

function roleFor(h: PcoHousehold, personId: string, child: boolean): string {
  if (h.primaryContactId === personId) return "Head";
  if (child) return "Child";
  return "Spouse";
}

// Among a person's candidate households, pick primary-contact first, then largest.
function pickBest(
  candidates: { h: PcoHousehold; child: boolean }[],
  personId: string,
): { h: PcoHousehold; child: boolean } | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aPrim = a.h.primaryContactId === personId ? 1 : 0;
    const bPrim = b.h.primaryContactId === personId ? 1 : 0;
    if (aPrim !== bPrim) return bPrim - aPrim;
    return b.h.members.length - a.h.members.length;
  })[0];
}

/** Build { pcoPersonId -> {b1HouseholdId, role} } for every person in a household. */
export async function getHouseholdLookup(): Promise<Record<string, HouseholdAssignment>> {
  const households = await pcoListHouseholds();

  // group candidate households per person (a person may appear in several)
  const candidatesByPerson = new Map<string, { h: PcoHousehold; child: boolean }[]>();
  for (const h of households) {
    for (const m of h.members) {
      const list = candidatesByPerson.get(m.personId) ?? [];
      list.push({ h, child: m.child });
      candidatesByPerson.set(m.personId, list);
    }
  }

  const lookup: Record<string, HouseholdAssignment> = {};
  for (const [personId, candidates] of candidatesByPerson) {
    const best = pickBest(candidates, personId);
    if (!best) continue;
    const b1HouseholdId = await ensureB1Household(best.h.id, best.h.name);
    const role = roleFor(best.h, personId, best.child);
    // A household with 2+ adults (a head + spouse) implies the adults are married.
    const adultCount = best.h.members.filter((m) => !m.child).length;
    const maritalStatus =
      (role === "Head" || role === "Spouse") && adultCount >= 2 ? "Married" : undefined;
    lookup[personId] = { b1HouseholdId, role, maritalStatus };
  }
  return lookup;
}

/** Resolve one person's household + role (for the webhook single-person path). */
export async function resolveHouseholdForPerson(
  personId: string,
  isChild: boolean,
): Promise<HouseholdAssignment | null> {
  const page = await pcoFetch(`/people/v2/people/${personId}/households?include=people`);
  const data = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
  if (data.length === 0) return null;

  const candidates = data.map((h) => {
    const pc = h.relationships?.primary_contact?.data;
    const memberRefs = Array.isArray(h.relationships?.people?.data)
      ? h.relationships!.people!.data!
      : [];
    const household: PcoHousehold = {
      id: h.id,
      name: String(h.attributes.name ?? ""),
      primaryContactId: pc && !Array.isArray(pc) ? pc.id : null,
      members: (memberRefs as { id: string }[]).map((m) => ({ personId: m.id, child: false })),
    };
    return { h: household, child: isChild };
  });

  const best = pickBest(candidates, personId);
  if (!best) return null;
  const b1HouseholdId = await ensureB1Household(best.h.id, best.h.name);
  const role = roleFor(best.h, personId, best.child);
  const maritalStatus =
    (role === "Head" || role === "Spouse") && best.h.members.length >= 2 ? "Married" : undefined;
  return { b1HouseholdId, role, maritalStatus };
}
