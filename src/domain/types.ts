// Entity types: plain, readonly objects. Services return new objects instead of
// editing the ones they were given; the store holds the only authoritative copy.

export type Zone = string; // an id from data/zones.json, e.g. 'gresham'
export type IsoDate = string; // 'YYYY-MM-DD'
export type HHMM = string; // 'HH:MM', 24-hour; see matching/time.ts

export type Role = 'driver' | 'rider' | 'both';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly homeZone: Zone;
}

export type OfferStatus = 'open' | 'full' | 'cancelled';

export interface Offer {
  readonly id: string;
  readonly driverId: string;
  readonly date: IsoDate;
  readonly fromZone: Zone;
  readonly arriveBy: HHMM; // at campus no later than this
  readonly departsAfter: HHMM; // will not leave home before this
  readonly seats: number; // passenger seats offered in total
  readonly seatsFree: number; // ...minus the ones a live match has reserved
  /** Zones the driver is willing to pass through on the way in. */
  readonly viaZones: readonly Zone[];
  readonly status: OfferStatus;
}

export type RequestStatus = 'open' | 'matched' | 'cancelled';

export interface Request {
  readonly id: string;
  readonly riderId: string;
  readonly date: IsoDate;
  readonly fromZone: Zone;
  readonly arriveBy: HHMM;
  readonly earliest: HHMM;
  readonly status: RequestStatus;
}

export type MatchStatus = 'proposed' | 'confirmed' | 'completed' | 'no-show' | 'cancelled';
export type Party = 'driver' | 'rider'; // which side of a match a person is on

export interface Match {
  readonly id: string;
  readonly offerId: string;
  readonly requestId: string;
  readonly createdOn: IsoDate;
  readonly status: MatchStatus;
  readonly attributedTo?: Party; // only for 'no-show': who did not turn up
}

export interface Reliability {
  readonly personId: string;
  readonly completed: number;
  readonly noShows: number;
  readonly score: number; // (completed + 1) / (completed + noShows + 2), 2 dp (R7)
}
