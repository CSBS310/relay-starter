// People and their reliability record. Small on purpose: the interesting
// behaviour lives in MatchService; this one validates input and answers lookups.

import { DomainError } from '../domain/errors.js';
import type { Person, Reliability, Role, Zone } from '../domain/types.js';
import type { IdGenerator, RelayStore } from '../matching/ports.js';
import { knowsZone, type ZoneMap } from '../zones/zones.js';
import { reliabilityOf, tallyAll, score, type History } from './reliability.js';

export class PeopleService {
  constructor(
    private readonly store: RelayStore,
    private readonly zones: ZoneMap,
    private readonly newId: IdGenerator,
  ) {}

  addPerson(name: string, role: Role, homeZone: Zone): Person {
    if (name.trim() === '') throw new DomainError('UNKNOWN_PERSON', 'A person needs a name');
    if (!knowsZone(this.zones, homeZone)) throw new DomainError('UNKNOWN_ZONE', `Unknown zone '${homeZone}'`);
    const person: Person = { id: this.newId('P'), name: name.trim(), role, homeZone };
    this.store.people.put(person);
    this.store.save();
    return person;
  }

  /** Accepts an id or a full name (case-insensitive), as a CLI user would type it. */
  find(idOrName: string): Person {
    const wanted = idOrName.trim().toLowerCase();
    const person = this.store.people.all().find((p) => p.id.toLowerCase() === wanted || p.name.toLowerCase() === wanted);
    if (person === undefined) throw new DomainError('UNKNOWN_PERSON', `No person '${idOrName}'`);
    return person;
  }

  all(): readonly Person[] {
    return [...this.store.people.all()].sort((a, b) => a.name.localeCompare(b.name));
  }

  reliability(personId: string): Reliability {
    return reliabilityOf(personId, this.history());
  }

  /** Everyone's record, best score first; newcomers sit at 0.50 (R7). */
  reliabilityBoard(): readonly Reliability[] {
    const tallies = tallyAll(this.history());
    return this.all()
      .map(({ id }) => {
        const t = tallies.get(id) ?? { completed: 0, noShows: 0 };
        return { personId: id, completed: t.completed, noShows: t.noShows, score: score(t.completed, t.noShows) };
      })
      .sort((a, b) => b.score - a.score || a.personId.localeCompare(b.personId));
  }

  private history(): History {
    return { offers: this.store.offers.all(), requests: this.store.requests.all(), matches: this.store.matches.all() };
  }
}
