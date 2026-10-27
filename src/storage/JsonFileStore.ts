// A store that lives in one JSON file. It loads everything into an InMemoryStore
// on construction and writes the whole file back on save(). Fine for one office
// and a few hundred records; see ARCHITECTURE.md for the limits.

import { readFileSync, writeFileSync } from 'node:fs';
import type { Snapshot } from '../matching/ports.js';
import { EMPTY_SNAPSHOT, InMemoryStore } from './InMemoryStore.js';

const asArray = <T>(v: unknown): readonly T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Tolerate a missing section in the file rather than crashing on undefined. */
export function snapshotFrom(raw: unknown): Snapshot {
  if (typeof raw !== 'object' || raw === null) return EMPTY_SNAPSHOT;
  const r = raw as Record<string, unknown>;
  return { people: asArray(r.people), offers: asArray(r.offers), requests: asArray(r.requests), matches: asArray(r.matches) };
}

export class JsonFileStore extends InMemoryStore {
  constructor(private readonly path: string) {
    super(snapshotFrom(JSON.parse(readFileSync(path, 'utf8'))));
  }

  override save(): void {
    writeFileSync(this.path, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
  }
}
