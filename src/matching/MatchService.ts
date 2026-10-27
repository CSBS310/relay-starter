// The heart of Relay: offers, requests, proposing and settling matches. Rules
// R1-R9 are listed in ARCHITECTURE.md; each method names the ones it enforces.
// Seat counts are stored on the offer and adjusted here as matches come and go.

import { isValidIsoDate, isoDate } from '../domain/dates.js';
import { DomainError, type ErrorCode } from '../domain/errors.js';
import type { Match, MatchStatus, Offer, Party, Person, Request, Zone } from '../domain/types.js';
import { knowsZone, type ZoneMap } from '../zones/zones.js';
import type { PeopleService } from '../people/PeopleService.js';
import type { Clock, IdGenerator, RelayStore, Snapshot } from './ports.js';
import { candidates, type Candidate } from './rank.js';
import { compareTime } from './time.js';

export type OfferInput = Pick<Offer, 'arriveBy' | 'departsAfter' | 'seats'> & { readonly viaZones?: readonly Zone[] };
export type RequestInput = Pick<Request, 'arriveBy' | 'earliest'>;

/** The ranked candidates that were considered, and the match made with the first. */
export interface Proposal {
  readonly candidates: readonly Candidate[];
  readonly match: Match;
}

/** Everything on one date. */
export type Board = Omit<Snapshot, 'people'> & { readonly date: string };

const MAX_SEATS = 8;
const LIVE: readonly MatchStatus[] = ['proposed', 'confirmed'];

/** Casts away readonly for in-place seat updates. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function missing(code: ErrorCode, what: string, id: string): never {
  throw new DomainError(code, `No ${what} '${id}'`);
}

function assertDate(date: string): void {
  if (!isValidIsoDate(date)) throw new DomainError('BAD_DATE', `Expected YYYY-MM-DD, got '${date}'`);
}

/** `earlier` strictly before `later`; compareTime rejects malformed times for us. */
function assertWindow(earlier: string, later: string, why: string): void {
  if (compareTime(earlier, later) >= 0) throw new DomainError('TIME_WINDOW', why);
}

export class MatchService {
  constructor(
    private readonly store: RelayStore,
    private readonly people: PeopleService,
    private readonly zones: ZoneMap,
    private readonly clock: Clock,
    private readonly newId: IdGenerator,
  ) {}

  postOffer(driver: Person, date: string, fromZone: Zone, input: OfferInput): Offer {
    if (driver.role === 'rider') throw new DomainError('WRONG_ROLE', `${driver.name} is registered as a rider, not a driver`);
    assertDate(date);
    this.assertZones([fromZone, ...(input.viaZones ?? [])]);
    assertWindow(input.departsAfter, input.arriveBy, 'An offer must depart before it arrives');
    if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > MAX_SEATS) {
      throw new DomainError('BAD_SEATS', `Seats must be a whole number from 1 to ${MAX_SEATS}`);
    }
    const { arriveBy, departsAfter, seats, viaZones = [] } = input;
    const offer: Offer = {
      id: this.newId('O'), driverId: driver.id, date, fromZone, arriveBy, departsAfter, seats, seatsFree: seats, viaZones, status: 'open',
    };
    return this.put(this.store.offers, offer);
  }

  postRequest(rider: Person, date: string, fromZone: Zone, input: RequestInput): Request {
    if (rider.role === 'driver') throw new DomainError('WRONG_ROLE', `${rider.name} is registered as a driver, not a rider`);
    assertDate(date);
    this.assertZones([fromZone]);
    assertWindow(input.earliest, input.arriveBy, 'A request must be able to leave before it has to arrive');
    const request: Request = {
      id: this.newId('R'), riderId: rider.id, date, fromZone, arriveBy: input.arriveBy, earliest: input.earliest, status: 'open',
    };
    return this.put(this.store.requests, request);
  }

  /** R1-R3, R5, R6: rank the open offers for a request and reserve a seat on the best (R4). */
  propose(requestId: string): Proposal {
    const request = this.request(requestId);
    if (request.status === 'matched') throw new DomainError('RIDER_ALREADY_MATCHED', `Request ${request.id} is already matched`);
    if (request.status !== 'open') throw new DomainError('REQUEST_NOT_OPEN', `Request ${request.id} is ${request.status}`);
    this.assertRiderFree(request);
    const ranked = candidates(request, this.store.offers.all(), (id) => this.people.reliability(id).score, this.zones);
    if (ranked.length === 0) {
      throw new DomainError('NO_CANDIDATES', `No open offer can reach ${request.fromZone} on ${request.date}`);
    }
    const best = ranked[0].offer;
    const match: Match = { id: this.newId('M'), offerId: best.id, requestId: request.id, createdOn: isoDate(this.clock()), status: 'proposed' };
    this.store.matches.put(match);
    this.store.requests.put({ ...request, status: 'matched' });
    const seatsFree = best.seatsFree - 1;
    this.store.offers.put({ ...best, seatsFree, status: seatsFree === 0 ? 'full' : 'open' });
    this.store.save();
    return { candidates: ranked, match };
  }

  confirm(matchId: string): Match {
    return this.transition(this.match(matchId), ['proposed'], 'confirmed');
  }

  /** R9: only on or after the ride's date. */
  complete(matchId: string): Match {
    const match = this.match(matchId);
    this.assertRideDayReached(match);
    return this.transition(match, ['confirmed'], 'completed');
  }

  /** R4, R7, R9: the seat is released; reliability follows from the stored attribution. */
  noShow(matchId: string, attributedTo: Party): Match {
    const match = this.match(matchId);
    this.assertRideDayReached(match);
    if (!LIVE.includes(match.status)) {
      throw new DomainError('BAD_STATUS', `Match ${match.id} is ${match.status}, not proposed or confirmed`);
    }
    const updated: Match = { ...match, status: 'no-show', attributedTo };
    this.store.matches.put(updated);
    const offers = this.store.offers.all();
    for (let i = 0; i < offers.length; i += 1) {
      if (offers[i].id === match.offerId) {
        const offer = offers[i] as Mutable<Offer>;
        offer.seatsFree += 1;
        if (offer.status === 'full' && offer.seatsFree > 0) offer.status = 'open';
        this.store.offers.put(offer);
      }
    }
    this.store.save();
    return updated;
  }

  /** R8: every live match on the offer is cancelled, its seat released and its request reopened. */
  cancelOffer(offerId: string): readonly Match[] {
    const offer = this.offer(offerId);
    if (offer.status === 'cancelled') throw new DomainError('OFFER_NOT_OPEN', `Offer ${offer.id} is already cancelled`);
    const cancelled: Match[] = [];
    const matches = this.store.matches.all();
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i];
      if (m.offerId !== offer.id) continue;
      if (m.status === 'proposed' || m.status === 'confirmed') {
        const done: Match = { ...m, status: 'cancelled' };
        this.store.matches.put(done);
        cancelled.push(done);
        const request = this.store.requests.get(m.requestId);
        if (request !== undefined && request.status === 'matched') {
          this.store.requests.put({ ...request, status: 'open' });
        }
        const mutable = offer as Mutable<Offer>;
        mutable.seatsFree += 1;
      }
    }
    const mutable = offer as Mutable<Offer>;
    mutable.status = 'cancelled';
    this.store.offers.put(mutable);
    this.store.save();
    return cancelled;
  }

  /** Cancelling a request releases its seat if it had one (R4). */
  cancelRequest(requestId: string): Request {
    const request = this.request(requestId);
    if (request.status === 'cancelled') throw new DomainError('REQUEST_NOT_OPEN', `Request ${request.id} is already cancelled`);
    const live = this.store.matches.all().find((m) => m.requestId === request.id && LIVE.includes(m.status));
    if (live !== undefined) {
      this.store.matches.put({ ...live, status: 'cancelled' });
      const offer = this.offer(live.offerId);
      this.store.offers.put({ ...offer, seatsFree: offer.seatsFree + 1, status: offer.status === 'full' ? 'open' : offer.status });
    }
    return this.put(this.store.requests, { ...request, status: 'cancelled' });
  }

  board(date: string): Board {
    assertDate(date);
    const offers = this.store.offers.all().filter((o) => o.date === date);
    const offerIds = new Set(offers.map((o) => o.id));
    return {
      date,
      offers,
      requests: this.store.requests.all().filter((r) => r.date === date),
      matches: this.store.matches.all().filter((m) => offerIds.has(m.offerId)),
    };
  }

  /** R5: one live match per rider per date. */
  private assertRiderFree(request: Request): void {
    const sameDay = this.store.requests.all().filter((r) => r.riderId === request.riderId && r.date === request.date).map((r) => r.id);
    const live = this.store.matches.all().find((m) => sameDay.includes(m.requestId) && m.status !== 'cancelled');
    if (live !== undefined) {
      throw new DomainError('RIDER_ALREADY_MATCHED', `Rider ${request.riderId} already has match ${live.id} on ${request.date}`);
    }
  }

  private assertRideDayReached(match: Match): void {
    const { date } = this.offer(match.offerId);
    if (isoDate(this.clock()) < date) throw new DomainError('TOO_EARLY', `Match ${match.id} is for ${date}; wait until then`);
  }

  private transition(match: Match, from: readonly MatchStatus[], to: MatchStatus): Match {
    if (!from.includes(match.status)) throw new DomainError('BAD_STATUS', `Match ${match.id} is ${match.status}, not ${from.join(' or ')}`);
    return this.put(this.store.matches, { ...match, status: to });
  }

  private put<T extends { readonly id: string }>(into: { put(item: T): void }, item: T): T {
    into.put(item);
    this.store.save();
    return item;
  }

  private assertZones(zones: readonly Zone[]): void {
    for (const z of zones) if (!knowsZone(this.zones, z)) throw new DomainError('UNKNOWN_ZONE', `Unknown zone '${z}'`);
  }

  private readonly offer = (id: string): Offer => this.store.offers.get(id) ?? missing('UNKNOWN_OFFER', 'offer', id);
  private readonly request = (id: string): Request => this.store.requests.get(id) ?? missing('UNKNOWN_REQUEST', 'request', id);
  private readonly match = (id: string): Match => this.store.matches.get(id) ?? missing('UNKNOWN_MATCH', 'match', id);
}
