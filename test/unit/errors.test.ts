import {describe, expect, it} from 'vitest';
import {
  BadRequest,
  HttpError,
  InternalServer,
  isHttpError,
  NotFound,
  throwFromAxiosError,
} from '../../src/errors';

const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as any;
  }
  throw new Error('expected a throw');
};

describe('error classes', () => {
  it('throw an HttpError with a stack trace when constructed', () => {
    const error = thrown(() => new NotFound('missing'));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({status: 404, message: 'missing'});
    expect(error.stack).toContain('missing');
  });

  it('mark client errors as ignorable and server errors as reportable', () => {
    expect(thrown(() => new BadRequest('x')).ignoreError).toBe(true);
    expect(thrown(() => new InternalServer('x')).ignoreError).toBe(false);
  });

  it('isHttpError works without instanceof', () => {
    const error = thrown(() => new BadRequest('x'));
    expect(isHttpError(error)).toBe(true);
    expect(isHttpError(new Error('x'))).toBe(false);
    expect(isHttpError({status: 400, message: 'x'})).toBe(false);
    expect(isHttpError(null)).toBe(false);
  });
});

describe('throwFromAxiosError', () => {
  const axiosError = (status?: number, message?: string) => ({
    message: `Request failed with status code ${status}`,
    response: status ? {status, data: message ? {message} : ''} : undefined,
  });

  it.each([400, 401, 403, 404])('keeps a remote %i', status => {
    expect(
      thrown(() => throwFromAxiosError(axiosError(status, 'm')))
    ).toMatchObject({status, message: 'm'});
  });

  it('keeps a 401 even without a response body', () => {
    expect(thrown(() => throwFromAxiosError(axiosError(401))).status).toBe(401);
  });

  it('turns network errors and other statuses into 500', () => {
    expect(thrown(() => throwFromAxiosError(axiosError())).status).toBe(500);
    expect(
      thrown(() => throwFromAxiosError(axiosError(502, 'bad'))).status
    ).toBe(500);
  });
});
