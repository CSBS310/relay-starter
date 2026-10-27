// Times of day as 'HH:MM' strings. The domain never converts them to Date
// objects; it only needs to compare them and check they are well formed.

import { DomainError } from '../domain/errors.js';

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** Minutes since midnight, or a BAD_TIME error. '24:00' is not a time. */
export function toMinutes(t: string): number {
  const m = HHMM.exec(t);
  if (m === null) throw new DomainError('BAD_TIME', `Expected HH:MM, got '${t}'`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) {
    throw new DomainError('BAD_TIME', `'${t}' is not a time of day`);
  }
  return hours * 60 + minutes;
}

/** Negative when a is earlier than b, zero when equal, positive otherwise. */
export const compareTime = (a: string, b: string): number => toMinutes(a) - toMinutes(b);
export const notAfter = (a: string, b: string): boolean => compareTime(a, b) <= 0;
