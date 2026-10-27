// Calendar dates as 'YYYY-MM-DD' strings in the local time zone (so `<` orders them). Nothing in the
// domain calls `new Date()` directly; "now" always arrives through an injected
// Clock so tests can pin it.

import { DomainError } from './errors.js';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date of a Date, e.g. '2026-11-17'. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True for a real calendar date in the right shape ('2026-02-30' is not one). */
export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(new Date(`${s}T12:00`)) === s;
}

/** Parse '2026-11-17T07:00' as a local time. */
export function parseIsoDateTime(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    throw new DomainError('BAD_DATE', `Expected YYYY-MM-DDTHH:MM, got '${s}'`);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new DomainError('BAD_DATE', `'${s}' is not a real date and time`);
  return d;
}
