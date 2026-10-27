// The one error type the domain throws. The CLI prints `message` and exits
// non-zero; tests assert on `code` so wording can change freely.

export type ErrorCode =
  | 'UNKNOWN_PERSON' | 'UNKNOWN_ZONE' | 'UNKNOWN_OFFER' | 'UNKNOWN_REQUEST' | 'UNKNOWN_MATCH'
  | 'WRONG_ROLE' | 'BAD_TIME' | 'BAD_DATE' | 'BAD_SEATS' | 'TIME_WINDOW'
  | 'REQUEST_NOT_OPEN' | 'OFFER_NOT_OPEN' | 'RIDER_ALREADY_MATCHED' | 'NO_CANDIDATES'
  | 'BAD_STATUS' | 'TOO_EARLY' | 'USAGE';

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
