// Id generators. The CLI uses the sequential one so output reads as O11, R14,
// M08; anything that must never collide should use randomIds instead.

import { randomUUID } from 'node:crypto';
import type { IdGenerator, RelayStore } from '../matching/ports.js';

export const randomIds: IdGenerator = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;

const highest = (ids: readonly { readonly id: string }[]): number =>
  ids.reduce((max, { id }) => Math.max(max, Number(id.slice(1)) || 0), 0);

/** Next free 'P07'-style id per prefix, continuing from what the store already holds. */
export function sequentialIds(store: RelayStore): IdGenerator {
  const { people, offers, requests, matches } = store;
  const last: Record<string, number> = {
    P: highest(people.all()), O: highest(offers.all()), R: highest(requests.all()), M: highest(matches.all()),
  };
  return (prefix) => {
    last[prefix] = (last[prefix] ?? 0) + 1;
    return `${prefix}${String(last[prefix]).padStart(2, '0')}`;
  };
}
