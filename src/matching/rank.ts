// R1-R3 filtering and R6 ranking as pure functions. Nothing here touches the
// store; MatchService hands in the offers and a way to look up reliability.

import type { Offer, Request } from '../domain/types.js';
import { notAfter } from './time.js';
import { reachable, type Reach, type ZoneMap } from '../zones/zones.js';

export interface Candidate {
  readonly offer: Offer;
  readonly reach: Reach;
  readonly driverScore: number; // the driver's reliability at ranking time
}

export type ScoreLookup = (driverId: string) => number;

const REACH_RANK: Readonly<Record<Reach, number>> = { exact: 0, via: 1, adjacent: 2 };

/** R3: the driver arrives in time and does not leave before the rider can. */
export function timesCompatible(request: Request, offer: Offer): boolean {
  return notAfter(offer.arriveBy, request.arriveBy) && notAfter(request.earliest, offer.departsAfter);
}

/** 'HH:MM' without the colon, so '08:50' sorts as 0850. */
const arriveKey = (t: string): string => t.replace(':', '');

/** R6: exact before via before adjacent, then earliest arrival, then reliability, then id. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    REACH_RANK[a.reach] - REACH_RANK[b.reach] ||
    arriveKey(a.offer.arriveBy).localeCompare(arriveKey(b.offer.arriveBy)) ||
    b.driverScore - a.driverScore ||
    a.offer.id.localeCompare(b.offer.id)
  );
}

/** The offers that can serve a request, best first. Empty when none can. */
export function candidates(request: Request, offers: readonly Offer[], scoreOf: ScoreLookup, zones: ZoneMap): Candidate[] {
  const found: Candidate[] = [];
  for (const offer of offers) {
    if (offer.status !== 'open' || offer.date !== request.date) continue;
    const reach = reachable(request.fromZone, offer, zones);
    if (reach === null || !timesCompatible(request, offer)) continue;
    found.push({ offer, reach, driverScore: scoreOf(offer.driverId) });
  }
  return found.sort(compareCandidates);
}
