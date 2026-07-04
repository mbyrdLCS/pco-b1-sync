// One-way mirror: Planning Center people -> B1 people.

import { pcoListAllPeople, pcoGetPerson, type NormalizedPerson } from "./pco";
import { b1SavePerson, b1SavePeople, b1DeletePerson, type B1Person } from "./b1";
import {
  getB1Id,
  setMapping,
  setMappings,
  allMappings,
  removeMapping,
  claimCreate,
  releaseClaim,
  waitForMapping,
} from "./mapping";
import { getCampusMap } from "./campus";
import { getHouseholdLookup, resolveHouseholdForPerson, type HouseholdAssignment } from "./household";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toB1Person(
  n: NormalizedPerson,
  existingId?: string | null,
  campusMap: Record<string, string> = {},
  household?: HouseholdAssignment | null,
): B1Person {
  return {
    ...(existingId ? { id: existingId } : {}),
    name: {
      first: n.firstName,
      last: n.lastName,
      middle: n.middleName ?? null,
      nick: n.nickName ?? null,
    },
    contactInfo: {
      email: n.email ?? null,
      mobilePhone: n.mobilePhone ?? null,
      address1: n.address?.line1 ?? null,
      address2: n.address?.line2 ?? null,
      city: n.address?.city ?? null,
      state: n.address?.state ?? null,
      zip: n.address?.zip ?? null,
    },
    birthDate: n.birthdate ?? null,
    anniversary: n.anniversary ?? null,
    gender: n.gender ?? null,
    maritalStatus: household?.maritalStatus ?? (n.anniversary ? "Married" : null),
    membershipStatus: n.membershipStatus ?? null,
    nametagNotes: n.medicalNotes ?? null,
    campusId: n.primaryCampusPcoId ? (campusMap[n.primaryCampusPcoId] ?? null) : null,
    householdId: household?.b1HouseholdId ?? null,
    householdRole: household?.role ?? null,
  };
}

export type SyncResult = {
  pcoId: string;
  name: string;
  b1Id?: string;
  action?: "created" | "updated";
  error?: string;
};

/** Upsert one PCO person into B1, recording the id mapping. */
export async function syncPerson(n: NormalizedPerson): Promise<SyncResult> {
  let existingId = await getB1Id(n.pcoId);

  // No mapping yet: claim the create atomically. PCO fires person.created and
  // email.created as separate near-simultaneous webhooks — without this, both
  // invocations would create the person in B1 (duplicate).
  let claimed = false;
  if (!existingId) {
    if ((await claimCreate(n.pcoId)) === "claimed") {
      claimed = true;
    } else {
      existingId = await waitForMapping(n.pcoId);
      if (!existingId) {
        throw new Error(`concurrent create still in flight for PCO ${n.pcoId} — retry later`);
      }
    }
  }

  try {
    let campusMap = await getCampusMap();
    if (n.primaryCampusPcoId && !(n.primaryCampusPcoId in campusMap)) {
      campusMap = await getCampusMap(true);
    }
    let household: HouseholdAssignment | null = null;
    try {
      household = await resolveHouseholdForPerson(n.pcoId, n.child ?? false);
    } catch {
      // household resolution is best-effort on the single-person path
    }
    const saved = await b1SavePerson(toB1Person(n, existingId, campusMap, household));
    if (!saved?.id) {
      throw new Error(`B1 save returned no id for PCO ${n.pcoId}`);
    }
    await setMapping(n.pcoId, saved.id, n.updatedAt);
    return {
      pcoId: n.pcoId,
      name: `${n.firstName} ${n.lastName}`.trim(),
      b1Id: saved.id,
      action: existingId ? "updated" : "created",
    };
  } catch (e) {
    if (claimed) await releaseClaim(n.pcoId); // let a later attempt retry the create
    throw e;
  }
}

export async function syncPersonById(pcoId: string): Promise<SyncResult> {
  return syncPerson(await pcoGetPerson(pcoId));
}

/** Person deleted in PCO. Behavior is configurable via SYNC_DELETE_MODE:
 *    "delete" (default) — hard-delete the mirrored person in B1
 *    "unmap"            — keep the B1 record (and its check-in history), just
 *                         stop tracking it. Recommended during pilots.       */
export async function deletePersonByPcoId(
  pcoId: string,
): Promise<{ pcoId: string; b1Id?: string; action: string }> {
  const mode = process.env.SYNC_DELETE_MODE === "unmap" ? "unmap" : "delete";
  const b1Id = await getB1Id(pcoId);
  if (b1Id && mode === "delete") {
    try {
      await b1DeletePerson(b1Id);
    } catch {
      // already gone in B1 — fall through and clear the mapping anyway
    }
  }
  await removeMapping(pcoId);
  const action = !b1Id ? "unmapped" : mode === "delete" ? "deleted" : "unmapped (kept in B1)";
  return { pcoId, b1Id: b1Id ?? undefined, action };
}

export type SyncSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  elapsedMs: number;
  results: SyncResult[];
};

/** Batched upsert of an already-fetched set of people. Shared by backfill + reconcile. */
export async function syncPeople(
  people: NormalizedPerson[],
  { batchSize = 100 }: { batchSize?: number } = {},
): Promise<SyncSummary> {
  const startedAt = Date.now();
  const existing = await allMappings(); // read mapping once, look up in memory
  const campusMap = await getCampusMap(true); // ensure all B1 campuses exist up front
  const householdLookup = await getHouseholdLookup(); // ensure B1 households + roles
  const results: SyncResult[] = [];
  const toRecord: { pcoId: string; b1Id: string; updatedAt?: string }[] = [];

  for (const batch of chunk(people, batchSize)) {
    const payloads = batch.map((n) =>
      toB1Person(n, existing[n.pcoId]?.b1Id, campusMap, householdLookup[n.pcoId]),
    );
    try {
      const saved = await b1SavePeople(payloads);
      batch.forEach((n, i) => {
        const s = saved[i];
        const name = `${n.firstName} ${n.lastName}`.trim();
        if (s?.id) {
          toRecord.push({ pcoId: n.pcoId, b1Id: s.id, updatedAt: n.updatedAt });
          results.push({
            pcoId: n.pcoId,
            name,
            b1Id: s.id,
            action: existing[n.pcoId] ? "updated" : "created",
          });
        } else {
          results.push({ pcoId: n.pcoId, name, error: "B1 returned no id" });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const n of batch) {
        results.push({
          pcoId: n.pcoId,
          name: `${n.firstName} ${n.lastName}`.trim(),
          error: msg,
        });
      }
    }
  }

  await setMappings(toRecord); // single mapping write for the whole run

  return {
    total: people.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    failed: results.filter((r) => r.error).length,
    elapsedMs: Date.now() - startedAt,
    results,
  };
}

/** Full backfill of every PCO person into B1. */
export async function backfillAll(
  opts: { batchSize?: number } = {},
): Promise<SyncSummary> {
  return syncPeople(await pcoListAllPeople(), opts);
}
