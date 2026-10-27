// The interfaces the services depend on; all injected so the domain is testable
// without files or real time.

import type { Match, Offer, Person, Request } from '../domain/types.js';

/** A table of one entity type, keyed by id. `put` inserts or replaces. */
export interface Collection<T extends { readonly id: string }> {
  get(id: string): T | undefined;
  all(): readonly T[];
  put(item: T): void;
}

export interface RelayStore {
  readonly people: Collection<Person>;
  readonly offers: Collection<Offer>;
  readonly requests: Collection<Request>;
  readonly matches: Collection<Match>;
  /** Persist whatever has been `put` since the last save. A no-op in memory. */
  save(): void;
}

/** Everything the store knows, as plain data. Also the JSON file shape. */
export interface Snapshot {
  readonly people: readonly Person[];
  readonly offers: readonly Offer[];
  readonly requests: readonly Request[];
  readonly matches: readonly Match[];
}

export type Clock = () => Date; // the CLI passes the real clock or --now; tests pin one
export type IdGenerator = (prefix: string) => string; // fresh id for a one-letter prefix such as 'M'
