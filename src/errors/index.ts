const HTTP_ERROR = Symbol.for('api-chassis.HttpError');

/**
 * What the error classes below throw. It's a real Error, so it has a stack
 * trace, and it carries the HTTP status to respond with.
 */
export class HttpError extends Error {
  readonly status: number;
  /** When true the error is expected (e.g. a 404) and isn't sent to Sentry. */
  readonly ignoreError: boolean;
  readonly [HTTP_ERROR] = true;

  constructor(status: number, message: string, ignoreError = status < 500) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.ignoreError = ignoreError;
  }
}

/**
 * True for an HttpError from any copy of this package (the CJS and ESM builds
 * each have their own class, so `instanceof` isn't enough).
 */
export function isHttpError(error: unknown): error is HttpError {
  return typeof error === 'object' && error !== null && HTTP_ERROR in error;
}

// Constructing one of these throws an HttpError straight away, so
// `new NotFound('...')` works as a statement on its own.

export class BadRequest {
  readonly status = 400 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, true);
  }
}

export class NoContent {
  readonly status = 204 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, true);
  }
}
export class InternalServer {
  readonly status = 500 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, false);
  }
}

export class Unauthorized {
  readonly status = 401 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, true);
  }
}

export class PaymentRequired {
  readonly status = 402 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, false);
  }
}

export class Forbidden {
  readonly status = 403 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, false);
  }
}

export class NotFound {
  readonly status = 404 as const;
  constructor(message: string) {
    throw new HttpError(this.status, message, true);
  }
}

/**
 * Re-throws a failed axios call as an HttpError with the remote status and
 * message. Network errors and unexpected statuses become 500.
 */
export function throwFromAxiosError(err: any): never {
  const status = err?.response?.status;
  const message =
    err?.response?.data?.message ?? err?.message ?? String(err ?? 'Error');
  if ([204, 400, 401, 403, 404].includes(status)) {
    throw new HttpError(status, message);
  }
  throw new HttpError(500, message, false);
}
