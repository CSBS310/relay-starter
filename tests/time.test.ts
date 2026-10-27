import { describe, expect, it } from 'vitest';
import { isValidIsoDate, isoDate, parseIsoDateTime } from '../src/domain/dates.js';
import { compareTime, notAfter, toMinutes } from '../src/matching/time.js';

describe('time.ts', () => {
  it('converts HH:MM to minutes and rejects things that are not times of day', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('08:50')).toBe(530);
    expect(toMinutes('23:59')).toBe(1439);
    expect(() => toMinutes('24:00')).toThrowError(/not a time/);
    expect(() => toMinutes('08:60')).toThrowError(/not a time/);
    expect(() => toMinutes('eight')).toThrowError(/Expected HH:MM/);
    expect(() => toMinutes('')).toThrowError(/Expected HH:MM/);
  });

  it('compares times numerically, so 9:30 is before 10:00', () => {
    expect(compareTime('9:30', '10:00')).toBeLessThan(0);
    expect(compareTime('10:00', '10:00')).toBe(0);
    expect(notAfter('08:50', '09:00')).toBe(true);
    expect(notAfter('09:01', '09:00')).toBe(false);
  });
});

describe('dates.ts', () => {
  it('formats local dates and validates calendar dates, not just the shape', () => {
    expect(isoDate(new Date('2026-11-17T07:05'))).toBe('2026-11-17');
    expect(isoDate(new Date('2026-01-02T23:59'))).toBe('2026-01-02');
    expect(isValidIsoDate('2026-11-17')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('17/11/2026')).toBe(false);
  });

  it('parses --now values and rejects bad ones', () => {
    const now = parseIsoDateTime('2026-11-17T07:00');
    expect(isoDate(now)).toBe('2026-11-17');
    expect(now.getHours()).toBe(7);
    expect(() => parseIsoDateTime('2026-11-17')).toThrowError(/Expected/);
    expect(() => parseIsoDateTime('2026-13-45T07:00')).toThrowError(/not a real/);
  });
});
