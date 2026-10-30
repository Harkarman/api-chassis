import {afterEach, describe, expect, it} from 'vitest';
import {
  getInternalToken,
  isInternalRequest,
} from '../../src/libs/internal-token';

const req = (token?: string) => ({
  headers: token === undefined ? {} : {internaltoken: token},
});

describe('isInternalRequest', () => {
  const original = process.env.INTERNAL_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.INTERNAL_TOKEN;
    else process.env.INTERNAL_TOKEN = original;
  });

  it('is always false when INTERNAL_TOKEN is unset or empty', () => {
    delete process.env.INTERNAL_TOKEN;
    expect(getInternalToken()).toBeUndefined();
    expect(isInternalRequest(req('internal_token'))).toBe(false);
    expect(isInternalRequest(req(''))).toBe(false);
    process.env.INTERNAL_TOKEN = '';
    expect(isInternalRequest(req(''))).toBe(false);
  });

  it('matches only the exact token', () => {
    process.env.INTERNAL_TOKEN = 'secret';
    expect(isInternalRequest(req('secret'))).toBe(true);
    expect(isInternalRequest(req('secreT'))).toBe(false);
    expect(isInternalRequest(req('secret2'))).toBe(false);
    expect(isInternalRequest(req())).toBe(false);
    expect(isInternalRequest(undefined)).toBe(false);
  });
});
