import { describe, expect, it } from 'vitest';
import type { Offer, Request } from '../src/domain/types.js';
import { candidates, compareCandidates, timesCompatible, type Candidate } from '../src/matching/rank.js';
import { ZONES } from './helpers.js';

let n = 0;
function offer(over: Partial<Offer>): Offer {
  n += 1;
  return {
    id: `O${String(n).padStart(2, '0')}`,
    driverId: `D${n}`,
    date: '2026-11-17',
    fromZone: 'gresham',
    arriveBy: '08:50',
    departsAfter: '07:30',
    seats: 2,
    seatsFree: 2,
    viaZones: [],
    status: 'open',
    ...over,
  };
}

const req: Request = {
  id: 'R01',
  riderId: 'P02',
  date: '2026-11-17',
  fromZone: 'gresham',
  arriveBy: '09:00',
  earliest: '07:00',
  status: 'open',
};

const flat = (): number => 0.5;

describe('timesCompatible (R3)', () => {
  it('accepts a driver who arrives in time and leaves late enough, rejects the rest', () => {
    expect(timesCompatible(req, offer({ arriveBy: '09:00', departsAfter: '07:00' }))).toBe(true);
    expect(timesCompatible(req, offer({ arriveBy: '09:01' }))).toBe(false);
    expect(timesCompatible(req, offer({ departsAfter: '06:59' }))).toBe(false);
  });
});

describe('candidates (R1, R2, R6)', () => {
  it('skips other dates, closed offers and unreachable zones', () => {
    const offers = [
      offer({ date: '2026-11-18' }),
      offer({ status: 'full' }),
      offer({ status: 'cancelled' }),
      offer({ fromZone: 'hood-river' }),
      offer({}),
    ];
    const found = candidates(req, offers, flat, ZONES);
    expect(found.map((c) => c.offer.id)).toEqual([offers[4].id]);
  });

  it('ranks exact before via before adjacent', () => {
    const adjacent = offer({ fromZone: 'fairview' });
    const via = offer({ fromZone: 'troutdale', viaZones: ['gresham'] });
    const exact = offer({});
    const found = candidates(req, [adjacent, via, exact], flat, ZONES);
    expect(found.map((c) => c.reach)).toEqual(['exact', 'via', 'adjacent']);
  });

  it('then prefers the earliest arrival', () => {
    const late = offer({ arriveBy: '08:55' });
    const early = offer({ arriveBy: '08:30' });
    const found = candidates(req, [late, early], flat, ZONES);
    expect(found.map((c) => c.offer.id)).toEqual([early.id, late.id]);
  });

  it('then prefers the more reliable driver, then the lower id', () => {
    const a = offer({ driverId: 'shaky' });
    const b = offer({ driverId: 'solid' });
    const c = offer({ driverId: 'solid' });
    const score = (id: string): number => (id === 'solid' ? 0.9 : 0.4);
    const found = candidates(req, [c, a, b], score, ZONES);
    expect(found.map((x) => x.offer.id)).toEqual([b.id, c.id, a.id]);
    expect(found[0].driverScore).toBe(0.9);
  });

  it('compareCandidates is a total order', () => {
    const x: Candidate = { offer: offer({}), reach: 'exact', driverScore: 0.5 };
    expect(compareCandidates(x, x)).toBe(0);
  });
});
