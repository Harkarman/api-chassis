import {NotFound, Unauthorized} from '../errors';
import {isInternalRequest} from '../libs/internal-token';
import {Logger} from '../logger';

/**
 * Finds the Express request among a hook's arguments. Hooks get the method's
 * arguments followed by the result and/or previous hook data, so its position
 * varies by method and hook type.
 */
export function findRequest(params: any[]): any {
  for (let i = params.length - 1; i >= 0; i--) {
    const param = params[i];
    if (
      param &&
      typeof param === 'object' &&
      typeof param.method === 'string' &&
      typeof param.headers === 'object'
    ) {
      return param;
    }
  }
  return undefined;
}

export const disallow = () => {
  return new NotFound('Not Found');
};

export const externalDisallow = (...params: any[]) => {
  const req = findRequest(params);
  if (isInternalRequest(req)) {
    Logger.info('externalDisallow: internal request allowed', {
      url: req?.originalUrl,
    });
    return;
  }
  return new NotFound('Not Found');
};

export const loggedIn = (...params: any[]) => {
  const req = findRequest(params);
  const user = req?.user;
  if (!user) {
    return new Unauthorized('Logged in required');
  }
  return user;
};
