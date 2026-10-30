import {Server} from 'http';
import type {AddressInfo} from 'net';
import EventEmitter from 'events';
import express, {Application} from 'express';
import {Server as SocketServer} from 'socket.io';
import {createAdapter} from '@socket.io/redis-adapter';
import * as Sentry from '@sentry/node';
import {Redis, RedisOptions} from 'ioredis';
import {
  Logger,
  MicroServiceNames,
  ServiceTypes,
  Socket,
  SubMicroServiceNames,
} from '.';
import {MicroService, registerMicroServices} from './services';
import {registerServices} from './services/register-services';
import {InternalLogs} from './libs';
import {LoggerOptions} from 'express-winston';
import {Cache} from './libs/cache';

export const EVENTS = {
  SERVER_STARTED: 'SERVER_STARTED',
  SERVICES_REGISTERED: 'SERVICES_REGISTERED',
};
export class Services {
  private static services: ServiceTypes;
  static get<T extends keyof ServiceTypes>(service: T): ServiceTypes[T] {
    return this.services[service];
  }
  static set(services: any) {
    Services.services = services;
  }
}

export interface IMicroServices {
  [microService: string]: {
    [service: string]: MicroService;
  };
}

export class MicroServices {
  private static services: IMicroServices;
  static get<
    U extends keyof MicroServiceNames,
    T extends keyof SubMicroServiceNames,
  >(microServiceName: U, service: T): MicroService {
    return this.services[microServiceName as string][service as string];
  }
  static set(services: IMicroServices) {
    MicroServices.services = services;
  }
}

export const ChassisEvents = new EventEmitter();

export type Dialect = 'mongodb' | 'postgres';

export interface IExpressOptions {
  limit?: string;
}

/** Anything with a Joi-style `validateAsync`, e.g. a Joi object schema. */
export interface PayloadSchema {
  validateAsync(value: any, options?: any): Promise<any>;
}

export interface IAuth {
  required: boolean;
  baseURL: string;
  /**
   * The shape a verified token's payload must have. The validated value is
   * merged into `req.user`; a payload that fails validation gets a 401.
   * Without it, any token the auth service accepts is allowed and its
   * payload becomes `req.user`.
   */
  payload?: PayloadSchema;
}
export interface IResponse {
  flat: boolean;
}

export interface ISocket {
  enable: boolean;
  socketCorsOrigin: string;
  redis?: {
    url?: string;
    redisOptions?: RedisOptions;
  };
}

export interface Config {
  app: Application;
  /**
   * Directory containing the `services/` and `micro-services/` folders.
   * Defaults to the directory of the entry script.
   */
  rootDir?: string;
  database?: {
    dialect?: Dialect;
    /**
     * When set, each service's `model` default export is called with this
     * instance (e.g. a Sequelize connection) to build the model.
     */
    instance?: any;
  };
  auth?: IAuth;
  socket?: ISocket;
  sentry?: {
    dsn: string;
    options?: Sentry.NodeOptions;
  };
  caching?: {
    redisUrl: string;
    keyPrefix: string;
    redisOptions?: RedisOptions;
  };
  logger?: {
    express?: Partial<LoggerOptions>;
  };
  express?: IExpressOptions;
  response?: IResponse;
}

export class Chassis {
  readonly app: Application;
  readonly server: Server;
  /** Resolves once services are registered and the server is listening. */
  readonly ready: Promise<void>;
  constructor({
    app,
    rootDir,
    database,
    express,
    auth,
    response,
    logger,
    socket,
    caching,
    sentry,
  }: Config) {
    this.app = app;
    this.server = new Server(app);
    this.initSentry(sentry);
    this.init(express?.limit ?? '50mb', logger?.express);
    this.initSocket(socket?.enable, socket?.redis, socket?.socketCorsOrigin);
    this.initCache(caching);
    const microServicesRegistered = registerMicroServices(rootDir).then(
      services => {
        MicroServices.set(services);
      }
    );
    const servicesRegistered = registerServices(
      this.app,
      auth,
      response,
      database,
      rootDir
    ).then(services => {
      Services.set(services);
      this.initExpress404();
      ChassisEvents.emit(EVENTS.SERVICES_REGISTERED, true);
      return new Promise<void>((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(process.env.PORT ?? 3000, () => {
          const port = (this.server.address() as AddressInfo).port;
          ChassisEvents.emit(EVENTS.SERVER_STARTED, port);
          Logger.info(`Server Started ${port}`);
          resolve();
        });
      });
    });
    this.ready = Promise.all([
      microServicesRegistered,
      servicesRegistered,
    ]).then(() => undefined);
    // Log startup failures (e.g. a broken service file); the rethrow still
    // crashes the process unless the caller handles `ready`.
    this.ready.catch(error => {
      Logger.error('api-chassis failed to start', {error});
      throw error;
    });
  }

  private init(limit: string = '50mb', loggerOptions?: Partial<LoggerOptions>) {
    // Express 5 defaults to the "simple" parser; keep nested query objects
    // (e.g. ?price[$gt]=5) working as they did on Express 4.
    this.app.set('query parser', 'extended');
    this.app.use(InternalLogs.middleware(loggerOptions));
    this.app.use(express.json({limit}));
  }

  private initSocket(
    enable?: boolean,
    redis?: ISocket['redis'],
    socketCorsOrigin?: string
  ) {
    if (enable) {
      Socket.io = new SocketServer(this.server, {
        cors: {
          origin: socketCorsOrigin,
        },
      });
      if (redis) {
        const pubClient = redis.url
          ? new Redis(redis.url, redis.redisOptions ?? {})
          : new Redis(redis.redisOptions ?? {});
        const subClient = pubClient.duplicate();
        Socket.io.adapter(createAdapter(pubClient, subClient));
        Logger.info('Redis added to socket');
      }
    }
  }

  private initExpress404() {
    this.app.get('/healthz', (_, res) => {
      return res.status(200).send({
        message: 'ok',
        status: 200,
      });
    });

    this.app.use((req, res) => {
      return res.status(404).send({
        message: 'Not found',
      });
    });
  }

  private initCache(caching: Config['caching']): void {
    if (!caching) {
      return;
    }
    const {redisUrl, keyPrefix, redisOptions = {}} = caching;
    Cache.client = new Redis(redisUrl, {
      keyPrefix: keyPrefix,
      ...redisOptions,
    });
    Cache.client.on('connect', () => {
      Logger.info('Successfully connected to Redis Cache 🎉');
    });

    Cache.client.on('error', (error: any) => {
      Logger.error('Unable connected to Redis Cache', {
        error,
      });
    });
  }

  private initSentry(sentry: Config['sentry']) {
    if (!sentry?.dsn) {
      return;
    }

    const {dsn, options = {}} = sentry;

    // HTTP, Express, Mongo/Mongoose and unhandled-rejection integrations are
    // enabled by default in @sentry/node >= 8; Express errors are captured via
    // diagnostics channels, so no request/error middleware is needed.
    Sentry.init({
      dsn,
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!,
      ...options,
    });
  }
}
