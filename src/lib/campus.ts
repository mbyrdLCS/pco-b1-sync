// Maps PCO campuses -> B1 campuses by name, creating missing B1 campuses.
// Returns a { pcoCampusId: b1CampusId } lookup. Cached in process memory and
// refreshed on a miss (e.g. a newly added campus).

import { pcoListCampuses } from "./pco";
import { b1ListCampuses, b1CreateCampus } from "./b1";

let cache: Record<string, string> | null = null;

async function build(): Promise<Record<string, string>> {
  const pcoCampuses = await pcoListCampuses();
  if (pcoCampuses.length === 0) return {};

  const b1Campuses = await b1ListCampuses();
  const byName = new Map(b1Campuses.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const map: Record<string, string> = {};
  for (const c of pcoCampuses) {
    const key = c.name.trim().toLowerCase();
    let b1Id = byName.get(key);
    if (!b1Id) {
      try {
        b1Id = await b1CreateCampus(c.name);
        byName.set(key, b1Id);
      } catch (e) {
        // Lacking campus-create permission (or other error): skip mapping this
        // campus so people in it sync without a campus instead of failing the run.
        console.warn(`campus map: could not create B1 campus "${c.name}": ${e}`);
        continue;
      }
    }
    map[c.id] = b1Id;
  }
  return map;
}

export async function getCampusMap(force = false): Promise<Record<string, string>> {
  if (cache && !force) return cache;
  cache = await build();
  return cache;
}

export async function resolveCampusB1Id(
  pcoCampusId: string | null | undefined,
): Promise<string | null> {
  if (!pcoCampusId) return null;
  let map = await getCampusMap();
  if (!(pcoCampusId in map)) map = await getCampusMap(true); // refresh for a new campus
  return map[pcoCampusId] ?? null;
}
