/**
 * Domain errors.
 *
 * Services throw these; server actions map them to a user-facing message and an
 * error code. Messages are written for the person reading them, not for a log.
 */

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;

  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;

  constructor(message = 'That record could not be found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export type DomainError = ForbiddenError | NotFoundError;

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof ForbiddenError || error instanceof NotFoundError;
}
