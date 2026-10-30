import type {Application, Request, Response} from 'express';
import {promises} from 'fs';
import path from 'path';
import {Router} from 'express';
import {Config, IAuth, IResponse, Logger, PayloadSchema} from '..';
import {IChassisServiceProps} from '.';
import {BadRequest, isHttpError, Unauthorized} from '../errors';
import {AuthService} from './auth';
import * as Sentry from '@sentry/node';
import {getInternalToken, isInternalRequest} from '../libs/internal-token';
import {
  isServiceEntry,
  loadOptionalModule,
  resolveRootDir,
} from './load-module';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

type Functions = 'find' | 'get' | 'create' | 'update' | 'patch' | 'remove';

interface Methods {
  method: Method;
  url: string;
  func: Functions;
}

const SERVICE_FILE_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
]);

async function validate(Validator: any, func: string, value: any) {
  const schema = await Validator[func];
  if (schema) {
    try {
      const schemaValue = await schema().validateAsync(value);
      return schemaValue;
    } catch (error: any) {
      Logger.error('Error', {
        message: error?.message,
        error,
      });
      return new BadRequest(error.message);
    }
  }
}

async function hooks(Hooks: any, func: string, parameters: any[]) {
  const allHooks = Hooks[func] ?? [];
  let data = null;
  for (const hook of allHooks) {
    const hookData: any = await hook?.(...[...parameters, data]);
    data = hookData;
  }
  return {
    allHooks,
    data,
  };
}

/**
 * Reads the JWT payload. It does NOT check the signature: only call it after
 * the auth service's /verify endpoint has accepted the token.
 */
export function getJWTDecoded(accessToken: string) {
  try {
    const token = accessToken.replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? decoded
      : {};
  } catch (error) {
    Logger.error('getJWTDecoded', error);
    return {};
  }
}

/** Checks a verified token's payload against the configured schema. */
async function validatePayload(
  schema: PayloadSchema | undefined,
  payload: any
) {
  if (!schema) {
    return payload;
  }
  try {
    return await schema.validateAsync(payload);
  } catch (error: any) {
    // Logged, not returned: the message would describe the expected claims.
    Logger.warn('Token payload rejected', {message: error?.message});
    return new Unauthorized("You don't have permission");
  }
}

async function loadService(serviceDirPath: string, serviceName: string) {
  const service =
    (await loadOptionalModule(`${serviceDirPath}/${serviceName}`)) ??
    // nested layout: services/<name>/service
    (await loadOptionalModule(`${serviceDirPath}/${serviceName}/service`));
  if (!service) {
    throw new Error(
      `No service file found for "${serviceName}" (expected services/${serviceName}/service or services/${serviceName}/index)`
    );
  }
  return service;
}

/** Where each method's query (validated by find/get/remove) or body sits. */
const VALIDATED_PARAMETER: Record<Functions, number> = {
  find: 0,
  get: 1,
  create: 0,
  patch: 1,
  update: 1,
  remove: 1,
};

export async function registerServices(
  app: Application,
  auth?: IAuth,
  responseType?: IResponse,
  database?: Config['database'],
  rootDir?: string
) {
  const appDir = resolveRootDir(rootDir);
  const serviceDirPath = path.join(appDir, 'services');

  const entries = await promises.readdir(serviceDirPath, {
    withFileTypes: true,
  });
  const serviceEntries = entries.filter(
    entry =>
      isServiceEntry(entry.name) &&
      (entry.isDirectory() ||
        SERVICE_FILE_EXTENSIONS.has(path.extname(entry.name)))
  );

  if (auth?.required && !getInternalToken()) {
    Logger.warn(
      'INTERNAL_TOKEN is not set, so service-to-service requests must authenticate like any other request',
      {}
    );
  }

  const methods: Methods[] = [
    {
      method: 'get',
      url: '/',
      func: 'find',
    },
    {
      method: 'get',
      url: '/:id',
      func: 'get',
    },
    {
      method: 'post',
      url: '/',
      func: 'create',
    },
    {
      method: 'patch',
      url: '/:id',
      func: 'patch',
    },
    {
      method: 'put',
      url: '/:id',
      func: 'update',
    },
    {
      method: 'delete',
      url: '/:id',
      func: 'remove',
    },
  ];

  const services: {[serviceName: string]: any} = {};

  for (const entry of serviceEntries) {
    // services/widgets.js is mounted at /widgets, not /widgets.js
    const serviceName = entry.isDirectory()
      ? entry.name
      : path.parse(entry.name).name;
    const modelPath = `${serviceDirPath}/${serviceName}/model`;
    const validatorPath = `${serviceDirPath}/${serviceName}/validator`;
    const hooksPath = `${serviceDirPath}/${serviceName}/hooks`;
    let Model = null;
    let Validator: any = null;
    let Hooks: any = null;

    const modelModule = await loadOptionalModule(modelPath);
    if (modelModule) {
      const modelExport = modelModule.default;
      Model = database?.instance ? modelExport(database.instance) : modelExport;
    }

    const validatorModule = await loadOptionalModule(validatorPath);
    if (validatorModule) {
      Validator = new validatorModule.default();
    }

    const hooksModule = await loadOptionalModule(hooksPath);
    if (hooksModule) {
      Hooks = new hooksModule.default();
    }
    const serviceConfig: Partial<IChassisServiceProps> = {};

    if (Model) {
      serviceConfig.Model = Model;
    }
    serviceConfig.dialect = database?.dialect ?? 'mongodb';

    const service = new (await loadService(serviceDirPath, entry.name)).default(
      serviceConfig
    );
    services[serviceName] = service;
    const router = Router();
    for (const {method, url, func} of methods) {
      const callback = async (req: Request, res: Response) => {
        const {required, baseURL} = auth ?? {};
        const {params, query, body, baseUrl} = req;

        try {
          if (service.auth !== false && !isInternalRequest(req)) {
            if (required && baseURL) {
              const authorization = req.headers['authorization'];
              if (!authorization) {
                return new Unauthorized("You don't have permission");
              }

              const authService = new AuthService({
                baseURL: baseURL,
                axiosConfig: {
                  headers: {
                    Authorization: authorization,
                  },
                },
              });

              // Throws (401 etc.) unless the auth service accepts the token,
              // so the payload decoded below has been verified.
              await authService.verify();

              const tokenUser = await validatePayload(
                auth?.payload,
                getJWTDecoded(authorization)
              );
              (req as any).user = {...((req as any).user ?? {}), ...tokenUser};
            }
          }

          const user = (req as any).user;
          const {id} = params;
          let parameters: any[] = [];
          switch (func) {
            case 'find':
              parameters = [query, user, req, res];
              break;
            case 'get':
              parameters = [id, query, user, req, res];
              break;
            case 'create':
              parameters = [body, query, user, req, res];
              break;
            case 'patch':
              parameters = [id, body, query, user, req, res];
              break;
            case 'update':
              parameters = [id, body, query, user, req, res];
              break;
            case 'remove':
              parameters = [id, query, user, req, res];
              break;
          }
          if (Hooks) {
            if (Hooks?.before) {
              await hooks(Hooks.before, 'all', parameters);
              await hooks(Hooks.before, func, parameters);
            }
            await hooks(Hooks, 'all', parameters);
            await hooks(Hooks, func, parameters);
          }

          if (service[func] == undefined) {
            return res.status(404).send({
              message: 'Not found',
            });
          }
          if (Validator) {
            const index = VALIDATED_PARAMETER[func];
            const validated = await validate(
              Validator,
              func,
              parameters[index]
            );
            // Pass on the validated value, with the schema's defaults and
            // conversions applied.
            if (validated !== undefined) {
              parameters[index] = validated;
            }
          }

          const response = await service[func](...parameters);
          let data = response;

          if (Hooks?.after) {
            const {data: allHookData} = await hooks(Hooks.after, 'all', [
              ...parameters,
              data,
            ]);
            const {data: hookData} = await hooks(Hooks.after, func, [
              ...parameters,
              data,
            ]);
            const finalHookData = hookData ?? allHookData;
            if (finalHookData) {
              data = finalHookData;
            }
          }

          if (response == null) {
            if (id) {
              return res
                .status(400)
                .send({message: `No record found for ${id}`});
            }
            return res.status(400).send({message: 'Bad Request'});
          }

          if (responseType?.flat) {
            return res.send(data);
          }
          return res.send({
            message: 'ok',
            data,
          });
        } catch (error: any) {
          const errorBody = JSON.parse(JSON.stringify(body ?? {}));
          const ignoreErrorBodyKeys: string[] = service.ignoreErrorBodyKeys ?? [
            'token',
            'error',
            'password',
          ];
          ignoreErrorBodyKeys.forEach(key => {
            delete errorBody[key];
          });

          if (!error?.ignoreError) {
            Sentry.captureException(error);
          }

          Logger.error('Error', {
            baseUrl,
            url,
            id: params.id,
            body: errorBody,
            query,
            message: error?.message,
            error,
          });
          if (isHttpError(error)) {
            return res.status(error.status).send({message: error.message});
          }
          if (error instanceof Error) {
            return res.status(500).send({message: 'Something went wrong'});
          }
          if (typeof error === 'object') {
            // Express 5 rejects invalid status codes instead of sending them.
            const status = Number.isInteger(error?.status) ? error.status : 500;
            return res.status(status).send({message: error.message});
          }
          return res.status(500).send({message: 'Something went wrong'});
        }
      };
      router[method](url, callback);
    }
    app.set('services', services);

    app.use(`/${serviceName}`, router);
  }
  return services;
}
