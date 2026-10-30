import {describe, expect, it} from 'vitest';
import {findRequest, loggedIn} from '../../src/hooks';

const req = {method: 'GET', headers: {}, user: {id: 1}};
const res = {statusCode: 200, getHeader: () => undefined};

describe('findRequest', () => {
  it('finds req wherever it sits in the hook arguments', () => {
    // before hook on find: (query, user, req, res, previousHookData)
    expect(findRequest([{}, undefined, req, res, null])).toBe(req);
    // after hook on patch: (id, body, query, user, req, res, result, previous)
    expect(findRequest(['1', {}, {}, undefined, req, res, {a: 1}, null])).toBe(
      req
    );
    expect(findRequest([{}, res])).toBeUndefined();
  });
});

describe('loggedIn', () => {
  it('returns the user when req.user is set', () => {
    expect(loggedIn({}, undefined, req, res, null)).toEqual({id: 1});
  });

  it('throws 401 otherwise', () => {
    expect(() =>
      loggedIn({}, undefined, {...req, user: undefined}, res, null)
    ).toThrow(expect.objectContaining({status: 401}));
  });
});
