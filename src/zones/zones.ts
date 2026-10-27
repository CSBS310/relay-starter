// The zone list and its adjacency graph: which zones a driver will realistically
// detour through for a rider. Loaded once from data/zones.json and passed in
// wherever it is needed.

import { readFileSync } from 'node:fs';
import { DomainError } from '../domain/errors.js';
import type { Offer, Zone } from '../domain/types.js';

export interface ZoneMap {
  readonly zones: readonly Zone[];
  /** Symmetric: if a lists b, b lists a. Checked at load time. */
  readonly adjacency: Readonly<Record<Zone, readonly Zone[]>>;
}

/** How a rider's zone relates to an offer; better reach ranks higher (R6). */
export type Reach = 'exact' | 'via' | 'adjacent';

const bad = (why: string): DomainError => new DomainError('UNKNOWN_ZONE', `Zone file: ${why}`);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Build a ZoneMap from parsed JSON, rejecting unknown or one-way adjacencies. */
export function zoneMapFrom(raw: unknown): ZoneMap {
  const file = (raw ?? {}) as { readonly zones?: unknown; readonly adjacency?: unknown };
  if (!isStringArray(file.zones) || typeof file.adjacency !== 'object' || file.adjacency === null) {
    throw bad('needs a "zones" array and an "adjacency" object');
  }
  const adjacency: Record<Zone, readonly Zone[]> = Object.fromEntries(file.zones.map((z) => [z, []]));
  for (const [zone, list] of Object.entries(file.adjacency)) {
    if (!file.zones.includes(zone) || !isStringArray(list)) throw bad(`adjacency lists an unknown zone '${zone}'`);
    adjacency[zone] = list;
  }
  assertSymmetric(adjacency);
  return { zones: file.zones, adjacency };
}

function assertSymmetric(adjacency: Readonly<Record<Zone, readonly Zone[]>>): void {
  for (const [zone, list] of Object.entries(adjacency)) {
    for (const other of list) {
      if (!adjacency[other]?.includes(zone)) throw bad(`adjacency ${zone} -> ${other} is one-way or unknown`);
    }
  }
}

export const loadZones = (path: string): ZoneMap => zoneMapFrom(JSON.parse(readFileSync(path, 'utf8')));
export const knowsZone = (map: ZoneMap, zone: Zone): boolean => map.zones.includes(zone);
export const neighbours = (map: ZoneMap, zone: Zone): readonly Zone[] => map.adjacency[zone] ?? [];

/**
 * R2: a rider can be picked up when their zone is the offer's fromZone, one of
 * its viaZones, or one adjacency hop away. Null when the offer cannot serve it.
 */
export function reachable(riderZone: Zone, offer: Offer, map: ZoneMap): Reach | null {
  if (riderZone === offer.fromZone) return 'exact';
  if (offer.viaZones.includes(riderZone)) return 'via';
  if (neighbours(map, offer.fromZone).includes(riderZone)) return 'adjacent';
  return null;
}
