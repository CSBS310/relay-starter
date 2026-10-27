import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { score } from '../src/people/reliability.js';
import { randomIds, sequentialIds } from '../src/storage/ids.js';
import { InMemoryStore } from '../src/storage/InMemoryStore.js';
import { JsonFileStore, snapshotFrom } from '../src/storage/JsonFileStore.js';
import { DAY, driver, offer, request, rider, world } from './helpers.js';

describe('PeopleService', () => {
  it('adds people with sequential ids and finds them by id or name', () => {
    const w = world();
    const hana = w.people.addPerson('  Hana Okafor ', 'driver', 'gresham');
    expect(hana).toEqual({ id: 'P01', name: 'Hana Okafor', role: 'driver', homeZone: 'gresham' });
    expect(w.people.find('p01')).toEqual(hana);
    expect(w.people.find('hana okafor')).toEqual(hana);
    expect(() => w.people.find('Nobody')).toThrowError(DomainError);
  });

  it('rejects blank names and unknown zones', () => {
    const w = world();
    expect(() => w.people.addPerson('   ', 'rider', 'gresham')).toThrowError(/needs a name/);
    expect(() => w.people.addPerson('Zed', 'rider', 'atlantis')).toThrowError(/Unknown zone/);
  });

  it('lists people alphabetically', () => {
    const w = world();
    rider(w, 'Yuki');
    rider(w, 'Caleb');
    expect(w.people.all().map((p) => p.name)).toEqual(['Caleb', 'Yuki']);
  });
});

describe('reliability (R7)', () => {
  it('starts newcomers at 0.50 and smooths the score', () => {
    expect(score(0, 0)).toBe(0.5);
    expect(score(3, 0)).toBe(0.8);
    expect(score(1, 1)).toBe(0.5);
    expect(score(0, 2)).toBe(0.25);
  });

  it('credits both parties for a completed ride and blames only the attributed one', () => {
    const w = world();
    const hana = driver(w, 'Hana');
    const mateo = rider(w, 'Mateo');
    const caleb = rider(w, 'Caleb');
    offer(w, hana, { seats: 2 });
    const a = w.matches.propose(request(w, mateo).id).match;
    const b = w.matches.propose(request(w, caleb).id).match;
    w.matches.confirm(a.id);
    w.matches.complete(a.id);
    w.matches.noShow(b.id, 'driver');
    expect(w.people.reliability(hana.id)).toMatchObject({ completed: 1, noShows: 1, score: 0.5 });
    expect(w.people.reliability(mateo.id)).toMatchObject({ completed: 1, noShows: 0, score: 0.67 });
    expect(w.people.reliability(caleb.id)).toMatchObject({ completed: 0, noShows: 0, score: 0.5 });
  });

  it('orders the board by score, then id', () => {
    const w = world();
    const hana = driver(w, 'Hana');
    const mateo = rider(w, 'Mateo');
    offer(w, hana);
    const { match } = w.matches.propose(request(w, mateo).id);
    w.matches.confirm(match.id);
    w.matches.complete(match.id);
    rider(w, 'Caleb');
    const board = w.people.reliabilityBoard();
    expect(board.map((r) => [r.personId, r.score])).toEqual([
      ['P01', 0.67],
      ['P02', 0.67],
      ['P03', 0.5],
    ]);
  });
});

describe('storage', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function tempFile(contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'relay-'));
    dirs.push(dir);
    const path = join(dir, 'data.json');
    writeFileSync(path, contents);
    return path;
  }

  it('in-memory store round-trips a snapshot', () => {
    const w = world();
    offer(w, driver(w, 'Hana'));
    const copy = new InMemoryStore(w.store.snapshot());
    expect(copy.snapshot()).toEqual(w.store.snapshot());
    expect(copy.offers.get('O01')?.date).toBe(DAY);
  });

  it('JSON-file store loads, saves on every change and reloads the same data', () => {
    const path = tempFile('{"people":[{"id":"P01","name":"Hana","role":"driver","homeZone":"gresham"}]}');
    const store = new JsonFileStore(path);
    expect(store.people.get('P01')?.name).toBe('Hana');
    expect(store.offers.all()).toEqual([]);
    store.people.put({ id: 'P02', name: 'Mateo', role: 'rider', homeZone: 'gresham' });
    store.save();
    expect(JSON.parse(readFileSync(path, 'utf8')).people).toHaveLength(2);
    expect(new JsonFileStore(path).snapshot()).toEqual(store.snapshot());
  });

  it('tolerates a file that is not an object', () => {
    expect(snapshotFrom('nonsense')).toEqual({ people: [], offers: [], requests: [], matches: [] });
    expect(snapshotFrom({ people: 'no' }).people).toEqual([]);
  });

  it('id generators continue from what the store holds', () => {
    const store = new InMemoryStore({
      people: [],
      offers: [],
      requests: [],
      matches: [{ id: 'M07', offerId: 'O01', requestId: 'R01', createdOn: DAY, status: 'proposed' }],
    });
    const next = sequentialIds(store);
    expect(next('M')).toBe('M08');
    expect(next('P')).toBe('P01');
    expect(next('X')).toBe('X01');
    expect(randomIds('M')).toMatch(/^M-[0-9a-f]{8}$/);
  });
});
