import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { DAY, driver, offer, request, rider, world } from './helpers.js';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'not a DomainError';
  }
}

describe('posting offers and requests', () => {
  it('stores an open offer with all seats free', () => {
    const w = world();
    const o = offer(w, driver(w, 'Hana'), { seats: 3, via: ['fairview'] });
    expect(o).toMatchObject({ id: 'O01', seats: 3, seatsFree: 3, status: 'open', viaZones: ['fairview'] });
    expect(w.store.offers.get('O01')).toEqual(o);
  });

  it('rejects an offer from someone registered only as a rider', () => {
    const w = world();
    expect(codeOf(() => offer(w, rider(w, 'Caleb')))).toBe('WRONG_ROLE');
  });

  it('lets a person with role both post either side', () => {
    const w = world();
    const p = w.people.addPerson('Priya', 'both', 'hood-river');
    expect(offer(w, p).status).toBe('open');
    expect(request(w, p).status).toBe('open');
  });

  it('validates dates, zones, times, windows and seats', () => {
    const w = world();
    const d = driver(w, 'Hana');
    expect(codeOf(() => offer(w, d, { date: '2026-11-31' }))).toBe('BAD_DATE');
    expect(codeOf(() => offer(w, d, { from: 'portland' }))).toBe('UNKNOWN_ZONE');
    expect(codeOf(() => offer(w, d, { via: ['moon'] }))).toBe('UNKNOWN_ZONE');
    expect(codeOf(() => offer(w, d, { arrive: '8am' }))).toBe('BAD_TIME');
    expect(codeOf(() => offer(w, d, { departs: '09:00', arrive: '08:00' }))).toBe('TIME_WINDOW');
    expect(codeOf(() => offer(w, d, { seats: 0 }))).toBe('BAD_SEATS');
    expect(codeOf(() => offer(w, d, { seats: 2.5 }))).toBe('BAD_SEATS');
  });

  it('validates requests the same way', () => {
    const w = world();
    const r = rider(w, 'Caleb');
    expect(codeOf(() => request(w, r, { earliest: '09:30' }))).toBe('TIME_WINDOW');
    expect(codeOf(() => request(w, r, { earliest: 'dawn' }))).toBe('BAD_TIME');
    expect(codeOf(() => request(w, driver(w, 'Hana')))).toBe('WRONG_ROLE');
  });
});

describe('propose', () => {
  it('ranks candidates and reserves a seat on the best one (R4, R6)', () => {
    const w = world();
    const late = offer(w, driver(w, 'Ingrid'), { arrive: '08:55', seats: 1 });
    const early = offer(w, driver(w, 'Hana'), { arrive: '08:30', seats: 1 });
    const r = request(w, rider(w, 'Mateo'));
    const result = w.matches.propose(r.id);
    expect(result.candidates.map((c) => c.offer.id)).toEqual([early.id, late.id]);
    expect(result.match).toMatchObject({ offerId: early.id, requestId: r.id, status: 'proposed', createdOn: DAY });
    expect(w.store.offers.get(early.id)).toMatchObject({ seatsFree: 0, status: 'full' });
    expect(w.store.requests.get(r.id)?.status).toBe('matched');
  });

  it('fails with NO_CANDIDATES when nothing fits', () => {
    const w = world();
    offer(w, driver(w, 'Hana'), { from: 'hood-river' });
    const r = request(w, rider(w, 'Mateo'), { from: 'sandy' });
    expect(codeOf(() => w.matches.propose(r.id))).toBe('NO_CANDIDATES');
  });

  it('does not offer a full offer again', () => {
    const w = world();
    offer(w, driver(w, 'Hana'), { seats: 1 });
    w.matches.propose(request(w, rider(w, 'Mateo')).id);
    const second = request(w, rider(w, 'Caleb'));
    expect(codeOf(() => w.matches.propose(second.id))).toBe('NO_CANDIDATES');
  });

  it('gives a rider at most one live match per date (R5)', () => {
    const w = world();
    offer(w, driver(w, 'Hana'), { seats: 3 });
    const mateo = rider(w, 'Mateo');
    w.matches.propose(request(w, mateo).id);
    const again = request(w, mateo, { arrive: '09:30' });
    expect(codeOf(() => w.matches.propose(again.id))).toBe('RIDER_ALREADY_MATCHED');
    const tomorrow = request(w, mateo, { date: '2026-11-18' });
    expect(codeOf(() => w.matches.propose(tomorrow.id))).toBe('NO_CANDIDATES');
  });

  it('refuses to propose a matched or cancelled request twice', () => {
    const w = world();
    offer(w, driver(w, 'Hana'));
    const r = request(w, rider(w, 'Mateo'));
    w.matches.propose(r.id);
    expect(codeOf(() => w.matches.propose(r.id))).toBe('RIDER_ALREADY_MATCHED');
    const other = request(w, rider(w, 'Caleb'));
    w.matches.cancelRequest(other.id);
    expect(codeOf(() => w.matches.propose(other.id))).toBe('REQUEST_NOT_OPEN');
    expect(codeOf(() => w.matches.propose('R99'))).toBe('UNKNOWN_REQUEST');
  });
});

describe('confirm, complete and no-show', () => {
  it('walks proposed -> confirmed -> completed on the ride day (R9)', () => {
    const w = world('2026-11-16T18:00');
    offer(w, driver(w, 'Hana'));
    const { match } = w.matches.propose(request(w, rider(w, 'Mateo')).id);
    expect(w.matches.confirm(match.id).status).toBe('confirmed');
    expect(codeOf(() => w.matches.complete(match.id))).toBe('TOO_EARLY');
    w.setNow(`${DAY}T10:00`);
    expect(w.matches.complete(match.id).status).toBe('completed');
  });

  it('only allows the legal transitions', () => {
    const w = world();
    offer(w, driver(w, 'Hana'));
    const { match } = w.matches.propose(request(w, rider(w, 'Mateo')).id);
    expect(codeOf(() => w.matches.complete(match.id))).toBe('BAD_STATUS');
    w.matches.confirm(match.id);
    expect(codeOf(() => w.matches.confirm(match.id))).toBe('BAD_STATUS');
    w.matches.complete(match.id);
    expect(codeOf(() => w.matches.noShow(match.id, 'rider'))).toBe('BAD_STATUS');
    expect(codeOf(() => w.matches.confirm('M99'))).toBe('UNKNOWN_MATCH');
  });

  it('no-show releases the seat and records who is to blame (R4, R7)', () => {
    const w = world();
    const o = offer(w, driver(w, 'Hana'), { seats: 1 });
    const mateo = rider(w, 'Mateo');
    const { match } = w.matches.propose(request(w, mateo).id);
    expect(w.store.offers.get(o.id)?.status).toBe('full');
    const done = w.matches.noShow(match.id, 'rider');
    expect(done).toMatchObject({ status: 'no-show', attributedTo: 'rider' });
    expect(w.store.offers.get(o.id)).toMatchObject({ seatsFree: 1, status: 'open' });
    expect(w.people.reliability(mateo.id)).toMatchObject({ completed: 0, noShows: 1, score: 0.33 });
  });

  it('no-show is not allowed before the ride day (R9)', () => {
    const w = world('2026-11-10T08:00');
    offer(w, driver(w, 'Hana'));
    const { match } = w.matches.propose(request(w, rider(w, 'Mateo')).id);
    expect(codeOf(() => w.matches.noShow(match.id, 'driver'))).toBe('TOO_EARLY');
  });
});

describe('cancelling', () => {
  it('cancelling a request releases its seat', () => {
    const w = world();
    const o = offer(w, driver(w, 'Hana'), { seats: 1 });
    const r = request(w, rider(w, 'Mateo'));
    const { match } = w.matches.propose(r.id);
    expect(w.matches.cancelRequest(r.id).status).toBe('cancelled');
    expect(w.store.matches.get(match.id)?.status).toBe('cancelled');
    expect(w.store.offers.get(o.id)).toMatchObject({ seatsFree: 1, status: 'open' });
    expect(codeOf(() => w.matches.cancelRequest(r.id))).toBe('REQUEST_NOT_OPEN');
  });

  it('cancelling an offer cancels its live matches and frees the seats (R8)', () => {
    const w = world();
    const o = offer(w, driver(w, 'Hana'), { seats: 2 });
    const r1 = request(w, rider(w, 'Mateo'));
    const r2 = request(w, rider(w, 'Caleb'));
    const m1 = w.matches.propose(r1.id).match;
    const m2 = w.matches.propose(r2.id).match;
    w.matches.confirm(m2.id);
    const cancelled = w.matches.cancelOffer(o.id);
    expect(cancelled.map((m) => m.id).sort()).toEqual([m1.id, m2.id]);
    expect(w.store.offers.get(o.id)).toMatchObject({ status: 'cancelled', seatsFree: 2 });
    // Requests keep their matched status: the rider was told they had a ride
    // and the office follows up by hand.
    expect(w.store.requests.get(r1.id)?.status).toBe('matched');
    expect(w.store.requests.get(r2.id)?.status).toBe('matched');
    expect(codeOf(() => w.matches.cancelOffer(o.id))).toBe('OFFER_NOT_OPEN');
    expect(codeOf(() => w.matches.cancelOffer('O99'))).toBe('UNKNOWN_OFFER');
  });

  it('cancelling an offer leaves already-settled matches alone', () => {
    const w = world();
    const o = offer(w, driver(w, 'Hana'), { seats: 2 });
    const { match } = w.matches.propose(request(w, rider(w, 'Mateo')).id);
    w.matches.confirm(match.id);
    w.matches.complete(match.id);
    expect(w.matches.cancelOffer(o.id)).toEqual([]);
    expect(w.store.matches.get(match.id)?.status).toBe('completed');
  });
});

describe('board', () => {
  it('collects the offers, requests and matches of one date', () => {
    const w = world();
    const hana = driver(w, 'Hana');
    const o = offer(w, hana);
    offer(w, hana, { date: '2026-11-18' });
    const r = request(w, rider(w, 'Mateo'));
    request(w, rider(w, 'Caleb'), { date: '2026-11-18' });
    const { match } = w.matches.propose(r.id);
    const b = w.matches.board(DAY);
    expect(b.offers.map((x) => x.id)).toEqual([o.id]);
    expect(b.requests.map((x) => x.id)).toEqual([r.id]);
    expect(b.matches.map((x) => x.id)).toEqual([match.id]);
    expect(codeOf(() => w.matches.board('someday'))).toBe('BAD_DATE');
  });
});
