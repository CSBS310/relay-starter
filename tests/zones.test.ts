import { describe, expect, it } from 'vitest';
import type { Offer } from '../src/domain/types.js';
import { knowsZone, neighbours, reachable, zoneMapFrom } from '../src/zones/zones.js';
import { ZONES } from './helpers.js';

function offerFrom(fromZone: string, viaZones: string[] = []): Offer {
  return {
    id: 'O01',
    driverId: 'P01',
    date: '2026-11-17',
    fromZone,
    arriveBy: '08:50',
    departsAfter: '07:30',
    seats: 2,
    seatsFree: 2,
    viaZones,
    status: 'open',
  };
}

describe('zone map loading', () => {
  it('knows its zones and their neighbours', () => {
    expect(knowsZone(ZONES, 'sandy')).toBe(true);
    expect(knowsZone(ZONES, 'portland')).toBe(false);
    expect(neighbours(ZONES, 'boring')).toEqual(['gresham', 'sandy', 'estacada']);
    expect(neighbours(ZONES, 'nowhere')).toEqual([]);
  });

  it('rejects a malformed file, an unknown zone and one-way adjacency', () => {
    expect(() => zoneMapFrom({ zones: 'gresham' })).toThrowError(/zones/);
    expect(() => zoneMapFrom(null)).toThrowError(/zones/);
    expect(() => zoneMapFrom({ zones: ['a'], adjacency: { b: ['a'] } })).toThrowError(/unknown zone 'b'/);
    expect(() => zoneMapFrom({ zones: ['a', 'b'], adjacency: { a: ['b'] } })).toThrowError(/one-way/);
  });

  it('accepts zones with no adjacency entry', () => {
    const map = zoneMapFrom({ zones: ['a', 'b'], adjacency: {} });
    expect(neighbours(map, 'a')).toEqual([]);
  });
});

describe('reachable (R2)', () => {
  it('is exact in the fromZone, via in a via zone, adjacent one hop from the fromZone', () => {
    expect(reachable('gresham', offerFrom('gresham'), ZONES)).toBe('exact');
    expect(reachable('boring', offerFrom('sandy', ['boring']), ZONES)).toBe('via');
    expect(reachable('fairview', offerFrom('gresham'), ZONES)).toBe('adjacent');
  });

  it('is null when the rider is two or more hops away', () => {
    expect(reachable('hood-river', offerFrom('gresham'), ZONES)).toBeNull();
    expect(reachable('sandy', offerFrom('gresham'), ZONES)).toBeNull();
  });
});
