import {describe, expect, it} from 'vitest';
import {getJWTDecoded} from '../../src/services/register-services';
import {fakeJwt} from '../helpers/start-app';

describe('getJWTDecoded', () => {
  it('reads the payload with or without a Bearer prefix', () => {
    const token = fakeJwt({business: 'b1'});
    expect(getJWTDecoded(token)).toEqual({business: 'b1'});
    expect(getJWTDecoded(`Bearer ${token}`)).toEqual({business: 'b1'});
  });

  it('handles base64url characters', () => {
    // '>>>?' encodes to base64 containing '+' and '/', i.e. '-' and '_' in base64url
    const token = fakeJwt({business: '>>>???'});
    expect(token).toMatch(/[-_]/);
    expect(getJWTDecoded(token)).toEqual({business: '>>>???'});
  });

  it('returns an empty object for malformed tokens', () => {
    expect(getJWTDecoded('garbage')).toEqual({});
  });

  it('returns an empty object when the payload is not an object', () => {
    const part = Buffer.from('"just a string"').toString('base64url');
    expect(getJWTDecoded(`x.${part}.y`)).toEqual({});
  });
});
