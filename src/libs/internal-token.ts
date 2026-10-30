import {timingSafeEqual} from 'crypto';
import type {Request} from 'express';

export const INTERNAL_TOKEN_HEADER = 'internaltoken';

/**
 * The shared secret for service-to-service calls, or undefined when
 * INTERNAL_TOKEN isn't set. There is deliberately no default: a public
 * fallback would let anyone skip authentication.
 */
export function getInternalToken(): string | undefined {
  return process.env.INTERNAL_TOKEN || undefined;
}

/** True only when INTERNAL_TOKEN is set and the request carries it. */
export function isInternalRequest(req?: Pick<Request, 'headers'>): boolean {
  const expected = getInternalToken();
  const received = req?.headers?.[INTERNAL_TOKEN_HEADER];
  if (!expected || typeof received !== 'string') {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
