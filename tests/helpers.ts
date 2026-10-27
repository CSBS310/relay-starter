// Shared test fixture: an in-memory store, a fixed clock and sequential ids.
// Each test builds a fresh world so order never matters.

import type { Person, Zone } from '../src/domain/types.js';
import { MatchService } from '../src/matching/MatchService.js';
import type { Clock } from '../src/matching/ports.js';
import { PeopleService } from '../src/people/PeopleService.js';
import { sequentialIds } from '../src/storage/ids.js';
import { InMemoryStore } from '../src/storage/InMemoryStore.js';
import { zoneMapFrom, type ZoneMap } from '../src/zones/zones.js';

export const ZONES: ZoneMap = zoneMapFrom({
  zones: ['gresham', 'troutdale', 'fairview', 'boring', 'sandy', 'estacada', 'cascade-locks', 'hood-river'],
  adjacency: {
    gresham: ['troutdale', 'fairview', 'boring'],
    troutdale: ['gresham', 'fairview', 'cascade-locks'],
    fairview: ['gresham', 'troutdale'],
    boring: ['gresham', 'sandy', 'estacada'],
    sandy: ['boring'],
    estacada: ['boring'],
    'cascade-locks': ['troutdale', 'hood-river'],
    'hood-river': ['cascade-locks'],
  },
});

export const DAY = '2026-11-17';

export interface World {
  readonly store: InMemoryStore;
  readonly people: PeopleService;
  readonly matches: MatchService;
  setNow(iso: string): void;
}

export function world(now = `${DAY}T07:00`): World {
  const store = new InMemoryStore();
  let current = new Date(now);
  const clock: Clock = () => current;
  const ids = sequentialIds(store);
  const people = new PeopleService(store, ZONES, ids);
  const matches = new MatchService(store, people, ZONES, clock, ids);
  return {
    store,
    people,
    matches,
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}

export function driver(w: World, name: string, zone: Zone = 'gresham'): Person {
  return w.people.addPerson(name, 'driver', zone);
}

export function rider(w: World, name: string, zone: Zone = 'gresham'): Person {
  return w.people.addPerson(name, 'rider', zone);
}

export interface OfferOpts {
  readonly date?: string;
  readonly from?: Zone;
  readonly arrive?: string;
  readonly departs?: string;
  readonly seats?: number;
  readonly via?: readonly Zone[];
}

export function offer(w: World, d: Person, opts: OfferOpts = {}) {
  return w.matches.postOffer(d, opts.date ?? DAY, opts.from ?? 'gresham', {
    arriveBy: opts.arrive ?? '08:50',
    departsAfter: opts.departs ?? '07:30',
    seats: opts.seats ?? 2,
    viaZones: opts.via ?? [],
  });
}

export interface RequestOpts {
  readonly date?: string;
  readonly from?: Zone;
  readonly arrive?: string;
  readonly earliest?: string;
}

export function request(w: World, r: Person, opts: RequestOpts = {}) {
  return w.matches.postRequest(r, opts.date ?? DAY, opts.from ?? 'gresham', {
    arriveBy: opts.arrive ?? '09:00',
    earliest: opts.earliest ?? '07:00',
  });
}
