// The in-memory store: four Map-backed collections. Tests use it directly; the
// JSON-file store extends it so the two never drift apart.

import type { Match, Offer, Person, Request } from '../domain/types.js';
import type { Collection, RelayStore, Snapshot } from '../matching/ports.js';

export class InMemoryCollection<T extends { readonly id: string }> implements Collection<T> {
  private readonly items = new Map<string, T>();

  constructor(initial: readonly T[] = []) {
    for (const item of initial) this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  all(): readonly T[] {
    return [...this.items.values()];
  }

  put(item: T): void {
    this.items.set(item.id, item);
  }
}

export const EMPTY_SNAPSHOT: Snapshot = { people: [], offers: [], requests: [], matches: [] };

export class InMemoryStore implements RelayStore {
  readonly people: InMemoryCollection<Person>;
  readonly offers: InMemoryCollection<Offer>;
  readonly requests: InMemoryCollection<Request>;
  readonly matches: InMemoryCollection<Match>;

  constructor(snapshot: Snapshot = EMPTY_SNAPSHOT) {
    this.people = new InMemoryCollection(snapshot.people);
    this.offers = new InMemoryCollection(snapshot.offers);
    this.requests = new InMemoryCollection(snapshot.requests);
    this.matches = new InMemoryCollection(snapshot.matches);
  }

  snapshot(): Snapshot {
    const { people, offers, requests, matches } = this;
    return { people: people.all(), offers: offers.all(), requests: requests.all(), matches: matches.all() };
  }

  save(): void {} // nothing to do: the Maps are the only copy
}
