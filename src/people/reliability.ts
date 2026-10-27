// R7 as pure functions over the match history. Nothing is stored; the score is
// recomputed from completed and no-show matches whenever it is asked for.

import type { Match, Offer, Reliability, Request } from '../domain/types.js';

export interface History {
  readonly offers: readonly Offer[];
  readonly requests: readonly Request[];
  readonly matches: readonly Match[];
}

type Tally = { completed: number; noShows: number };

/** Smoothed success rate, so a newcomer starts at 0.50 rather than 0 or 1. */
export function score(completed: number, noShows: number): number {
  return Math.round(((completed + 1) / (completed + noShows + 2)) * 100) / 100;
}

/** Count completed rides and attributed no-shows for everyone who has either. */
export function tallyAll(history: History): ReadonlyMap<string, Tally> {
  const tallies = new Map<string, Tally>();
  const bump = (id: string | undefined, key: keyof Tally): void => {
    if (id === undefined) return;
    const t = tallies.get(id) ?? { completed: 0, noShows: 0 };
    t[key] += 1;
    tallies.set(id, t);
  };
  for (const match of history.matches) {
    const driverId = history.offers.find((o) => o.id === match.offerId)?.driverId;
    const riderId = history.requests.find((r) => r.id === match.requestId)?.riderId;
    if (match.status === 'completed') {
      bump(driverId, 'completed');
      bump(riderId, 'completed');
    } else if (match.status === 'no-show') {
      bump(match.attributedTo === 'driver' ? driverId : riderId, 'noShows');
    }
  }
  return tallies;
}

export function reliabilityOf(personId: string, history: History): Reliability {
  const t = tallyAll(history).get(personId) ?? { completed: 0, noShows: 0 };
  return { personId, completed: t.completed, noShows: t.noShows, score: score(t.completed, t.noShows) };
}
