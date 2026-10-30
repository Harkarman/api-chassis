# api-chassis

Convention-based Express 5 API framework for Node.js. Drop a folder into `services/` and you get a full REST resource: routes, validation, hooks, error handling and a consistent response shape.

```
services/
  widgets/
    service.ts     → GET/POST /widgets, GET/PUT/PATCH/DELETE /widgets/:id
    model.ts       → Mongoose model or Sequelize model factory
    validator.ts   → per-method request validation (optional)
    hooks.ts       → before/after hooks (optional)
```

## Features

- **File-system service registration.** Each folder in `services/` becomes a CRUD router, mounted at `/<folder-name>`.
- **MongoDB or PostgreSQL.** Built-in adapters for Mongoose and Sequelize. Override any method to customise behaviour.
- **Validation.** Plug in Joi (or any schema with `validateAsync`) per method. Invalid requests are rejected with `400`.
- **Hooks.** `before` and `after` hooks per method or for `all` methods, with ready-made `disallow`, `externalDisallow` and `loggedIn` hooks.
- **Typed HTTP errors.** Throw `BadRequest`, `Unauthorized`, `NotFound`, etc., and the right status and message are sent.
- **Micro-service clients.** Declare other services in `micro-services/` and get axios-backed `find/get/create/update/patch/remove` clients.
- **Batteries included.** Redis cache, BullMQ queues, Socket.IO (with an optional Redis adapter), Sentry, structured winston logging, `/healthz` and a JSON 404.
- **CommonJS and ESM.** Ships both builds plus TypeScript declarations. Your service files can be CJS, ESM or TypeScript (with a loader such as `tsx`).

## Requirements

- Node.js **26** or newer (the current LTS)
- Express **5**
- `mongoose` (8+) for MongoDB, or `sequelize` (6) for PostgreSQL. Both are optional peer dependencies, so install the one you use.
- Redis, if you use caching, queues or the Socket.IO Redis adapter

## Install

```sh
npm install api-chassis express
# plus one of:
npm install mongoose
npm install sequelize pg pg-hstore
```

## Quick start (MongoDB)

**`app.ts`**

```ts
import express from 'express';
import mongoose from 'mongoose';
import {Chassis} from 'api-chassis';

await mongoose.connect(process.env.MONGO_URL!);

new Chassis({
  app: express(),
  rootDir: import.meta.dirname, // folder containing services/ and micro-services/
});
```

**`services/widgets/model.ts`**

```ts
import {model, Schema} from 'mongoose';

export interface Widget {
  name: string;
  price: number;
}

export default model<Widget>(
  'Widget',
  new Schema<Widget>({
    name: {type: String, required: true},
    price: Number,
  })
);
```

**`services/widgets/service.ts`**

```ts
import {ChassisService} from 'api-chassis';
import type {Widget} from './model';

export default class Widgets extends ChassisService<Widget> {}
```

Start the app. The server listens on `PORT` (default `3000`):

```sh
curl -X POST localhost:3000/widgets -H 'content-type: application/json' -d '{"name":"bolt","price":10}'
# {"message":"ok","data":{"_id":"...","name":"bolt","price":10}}

curl 'localhost:3000/widgets?price[$gt]=5'
# {"message":"ok","data":[{"_id":"...","name":"bolt","price":10}]}
```

## Usage

### Routes

Each service folder is mounted at `/<folder-name>`:

| Method   | Path   | Service method                            |
| -------- | ------ | ----------------------------------------- |
| `GET`    | `/`    | `find(query, user, req, res)`             |
| `GET`    | `/:id` | `get(id, query, user, req, res)`          |
| `POST`   | `/`    | `create(body, query, user, req, res)`     |
| `PUT`    | `/:id` | `update(id, body, query, user, req, res)` |
| `PATCH`  | `/:id` | `patch(id, body, query, user, req, res)`  |
| `DELETE` | `/:id` | `remove(id, query, user, req, res)`       |

A service is either a folder (`services/<name>/service.*` or `services/<name>/index.*`, alongside its optional `model`, `validator` and `hooks` files) or a single file such as `services/<name>.js`, which is mounted at `/<name>`. Query strings use extended parsing, so `?price[$gt]=5` arrives as `{ price: { $gt: '5' } }`.

Responses are wrapped as `{ "message": "ok", "data": ... }`. Pass `response: { flat: true }` to send `data` on its own. If a service method returns `null` or `undefined`, the response is `400` (`No record found for <id>` when there is an id).

### Custom service logic

Override any method. The underscore variants (`_find`, `_get`, `_create`, `_update`, `_patch`, `_remove`) call the database adapter directly without the request arguments. `this.model` is the model itself.

```ts
import {ChassisService, NotFound, type Query, type User} from 'api-chassis';
import type {Widget} from './model';

export default class Widgets extends ChassisService<Widget> {
  async find(query: Query = {}, user?: User) {
    return this._find({...query, ownerId: user?.id});
  }

  async remove(id: string) {
    const widget = await this._get(id);
    if (!widget) new NotFound(`Widget ${id} not found`);
    return this._remove(id);
  }
}
```

Leave a method out of a service class that doesn't extend `ChassisService`, and its route returns `404`. Set `auth = false` on a service to skip the auth check (see [Authentication](#authentication)).

### PostgreSQL (Sequelize)

Pass the Sequelize instance as `database.instance`. Each `model` file then default-exports a **factory** that receives it:

```ts
// app.ts
const sequelize = new Sequelize(process.env.DATABASE_URL!);
new Chassis({
  app: express(),
  rootDir: import.meta.dirname,
  database: {dialect: 'postgres', instance: sequelize},
});
```

```ts
// services/orders/model.ts
import {DataTypes, type Sequelize} from 'sequelize';

export default (sequelize: Sequelize) =>
  sequelize.define('Order', {total: DataTypes.DECIMAL});
```

```ts
// services/orders/service.ts
import {ChassisService} from 'api-chassis';

interface Order {
  id: number;
  total: string;
}

export default class Orders extends ChassisService<Order, 'postgres'> {
  pagination = true; // find returns { rows, count } instead of an array
}
```

On Postgres, `find` supports `$limit` and `$offset`, and every other query key becomes a `where` clause.

### Validation

`validator.*` default-exports a class whose methods are named after the service methods. Each returns a schema with `validateAsync`, such as Joi. `find`, `get` and `remove` validate the query string. `create`, `update` and `patch` validate the body.

```ts
import Joi from 'joi';

export default class WidgetValidator {
  create = () =>
    Joi.object({name: Joi.string().required(), price: Joi.number()});
  patch = () => Joi.object({name: Joi.string(), price: Joi.number()});
}
```

A failed validation responds `400` with Joi's message. Otherwise the service receives the validated value, with the schema's defaults and conversions applied (for example `?limit=5` arrives as the number `5` with `Joi.number()`).

### Hooks

`hooks.*` default-exports a class with arrays of hook functions. You can key them by method (`find`, `get`, `create`, `update`, `patch`, `remove`) or use `all`.

- **Before hooks** go in `before`. Top-level keys also run before the method.
- **After hooks** go in `after`.

Each hook receives the method's arguments (as in the route table), followed by the previous hook's return value. After hooks also receive the result just before that. To stop a request, throw an error (or construct one; see [Errors](#errors)). When an after hook returns a value, that value replaces a non-array result.

```ts
import {disallow, loggedIn} from 'api-chassis';

export default class WidgetHooks {
  before = {
    all: [loggedIn], // 401 unless req.user is set
    remove: [disallow], // DELETE /widgets/:id → 404
  };
  after = {
    get: [
      (...args: any[]) => ({...args[args.length - 2], fetchedAt: Date.now()}),
    ],
  };
}
```

Built-in hooks:

- `disallow`: always responds `404`.
- `externalDisallow`: `404` unless the request carries the internal token (see [Security notes](#security-notes)).
- `loggedIn`: `401` unless `req.user` is set.

To find the Express request inside your own hook, use `findRequest(args)`. Its position in the arguments depends on the method and the hook type.

### Errors

Constructing one of these error classes **throws immediately**. `new NotFound('...')` is a complete statement, so you don't need to write `throw`. What gets thrown is an `HttpError`: a real `Error` with a stack trace, a `status` and a `message`. Use `isHttpError(error)` to recognise one in a `catch`:

| Class             | Status |
| ----------------- | ------ |
| `NoContent`       | 204    |
| `BadRequest`      | 400    |
| `Unauthorized`    | 401    |
| `PaymentRequired` | 402    |
| `Forbidden`       | 403    |
| `NotFound`        | 404    |
| `InternalServer`  | 500    |

If you throw any other object with a numeric `status`, that status and its `message` are used. Any other `Error`, or an object with no valid status, becomes `500 Something went wrong`. Unexpected errors are logged and sent to Sentry. When an error is logged, the request body is included, minus `token`, `error` and `password`. Set `ignoreErrorBodyKeys` on a service to change that list.

### Accessing services and micro-services

```ts
import {Services, MicroServices} from 'api-chassis';

const widgets = Services.get('widgets');
const invoices = MicroServices.get('billing', 'invoices');
```

For typed access, augment the registries:

```ts
declare module 'api-chassis' {
  interface ServiceTypes {
    widgets: import('./services/widgets/service').default;
  }
}
```

### Micro-service clients

Each file in `micro-services/` default-exports a class that describes a remote api-chassis-style service:

```ts
// micro-services/billing.ts
export default class Billing {
  name = 'billing';
  baseURL = process.env.BILLING_URL!;
  services = ['invoices', 'payments'];
  config = {timeout: 5000}; // axios config (optional)
}
```

```ts
const invoices = MicroServices.get('billing', 'invoices');
await invoices.find({status: 'open'});
await invoices.create({amount: 100});
await invoices.get(id, {}, {execption: {handle: true, defaultValue: null}}); // log and return default instead of throwing
invoices.call; // the underlying axios instance
```

When `INTERNAL_TOKEN` is set, requests send it in the `internaltoken` header, along with any headers in `config`. The `data` envelope is unwrapped from responses. Remote `400`, `401`, `403` and `404` errors are re-thrown as an `HttpError` with the same status and message. Anything else, including network errors, becomes `500`.

### Authentication

```ts
import Joi from 'joi';

new Chassis({
  app,
  auth: {
    required: true,
    baseURL: process.env.AUTH_URL!,
    // Optional: the claims a token's payload must carry.
    payload: Joi.object({
      sub: Joi.string().required(),
      tenant: Joi.string().required(),
    }).unknown(true),
  },
});
```

When `required` is set, every request needs an `Authorization` header. It's forwarded to `POST <baseURL>/verify` on your auth service, and any non-2xx response rejects the request (a `401` from the auth service stays a `401`).

Once the token is verified, its decoded payload is checked against `payload`, which can be any schema with a Joi-style `validateAsync`. A payload that doesn't match gets a `401`. The validated value, with the schema's defaults and renames applied, is merged into `req.user`. Without `payload`, any token the auth service accepts is allowed, and its whole payload becomes `req.user`.

Services with `auth = false` skip the check, and so do requests carrying the correct internal token.

### Cache, queues and sockets

```ts
new Chassis({
  app,
  caching: {redisUrl: process.env.REDIS_URL!, keyPrefix: 'widgets:'},
  socket: {
    enable: true,
    socketCorsOrigin: '*',
    redis: {url: process.env.REDIS_URL},
  },
  sentry: {dsn: process.env.SENTRY_DSN!},
});
```

```ts
import {Cache, Queue, Socket} from 'api-chassis';

await Cache.set('key', {any: 'json'}, 600); // TTL in seconds (default 600)
await Cache.get('key');
await Cache.delete('key');

const emails = new Queue<{to: string}>('emails', process.env.REDIS_URL!);
await emails.add({to: 'a@example.com'});
emails.consume(async job => {
  /* job.data.to ... */
}); // starts a BullMQ Worker and returns it

Socket.emit('widget:created', widget);
Socket.client(socket => socket.on('ping', () => socket.emit('pong')));
```

Queues are built on [BullMQ](https://docs.bullmq.io). The producer and its workers share one Redis connection, which `Queue` creates for you. Call `await emails.close()` on shutdown to close the workers, the queue and that connection.

- `add(data, opts?, jobName?)`: defaults to `removeOnComplete`, `removeOnFail` and `attempts: 1`. The job name defaults to the queue name.
- `consume(processor, opts?)`: workers are rate-limited to 30 jobs per 50 seconds by default. To change the limit, pass `limiter` in the `Queue` options, or in `consume`'s BullMQ `WorkerOptions` (`concurrency`, `limiter`, and so on).
- `emails.queue`: the underlying BullMQ `Queue`.

Queue names get an `_<ENVIRONMENT>` suffix (default `dev`). There's no suffix when `ENVIRONMENT` contains `prod`, unless it also contains `pre`. BullMQ doesn't allow `:` in queue names.

### Logging and lifecycle

`Logger.info/warn/error/debug` write structured JSON through winston. Set `NODE_ENV=local` or call `Logger.enableLogger()` to print to the console instead. HTTP requests are logged through express-winston, and you can customise this with `logger.express`. The `authorization`, `proxy-authorization`, `cookie` and `internaltoken` headers are left out of these logs.

```ts
import {ChassisEvents, EVENTS} from 'api-chassis';

ChassisEvents.on(EVENTS.SERVICES_REGISTERED, () => {
  /* routes are mounted */
});
ChassisEvents.on(EVENTS.SERVER_STARTED, port => {
  /* listening; port is the actual number, even with PORT=0 */
});

const chassis = new Chassis({app});
await chassis.ready; // services registered and server listening
```

Startup fails if a service, model, validator, hooks or micro-service file can't be loaded, for example because of a syntax error or a package it imports that's missing. The error is logged as `api-chassis failed to start`, and `chassis.ready` rejects. A file that simply doesn't exist is fine, because `model`, `validator` and `hooks` are optional.

`GET /healthz` returns `{ "message": "ok", "status": 200 }`. Unknown routes return `404 { "message": "Not found" }`.

### Configuration reference

| Option           | Description                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `app`            | Your Express 5 application (required).                                                      |
| `rootDir`        | Folder containing `services/` and `micro-services/`. Defaults to the entry script's folder. |
| `database`       | `{ dialect: 'mongodb' \| 'postgres', instance? }`. `instance` is passed to model factories. |
| `auth`           | `{ required, baseURL, payload? }`. See [Authentication](#authentication).                   |
| `response`       | `{ flat: true }` sends data without the `{ message, data }` envelope.                       |
| `express`        | `{ limit }`: JSON body size limit (default `50mb`).                                         |
| `caching`        | `{ redisUrl, keyPrefix, redisOptions? }` enables `Cache`.                                   |
| `socket`         | `{ enable, socketCorsOrigin, redis? }` enables Socket.IO.                                   |
| `sentry`         | `{ dsn, options? }` initialises Sentry.                                                     |
| `logger.express` | Options passed to express-winston.                                                          |

| Environment variable | Used for                                                       |
| -------------------- | -------------------------------------------------------------- |
| `PORT`               | HTTP port (default `3000`).                                    |
| `INTERNAL_TOKEN`     | Shared secret for service-to-service calls. Unset disables it. |
| `ENVIRONMENT`        | Queue name suffix.                                             |
| `NODE_ENV=local`     | Console logging.                                               |

## Security notes

- **`INTERNAL_TOKEN` is a bypass key.** Any request whose `internaltoken` header matches it skips authentication and `externalDisallow`, so use a long random value and keep it secret. When it isn't set, there's no bypass at all, and api-chassis logs a warning at startup if `auth.required` is on.
- api-chassis reads the JWT payload to fill `req.user` and to check it against `auth.payload`, but it never checks the token's signature itself. It only does this after your auth service's `/verify` endpoint has accepted the token, so that endpoint must do the real verification.

## Development

```sh
npm test                                # builds, then runs unit and integration tests
REDIS_URL=redis://localhost:6379 npm test   # also runs the BullMQ tests
```

The integration tests start the apps in `test/fixtures` as separate Node processes, against both the CommonJS and ESM builds. CI runs formatting, type-checking, lint and the full test suite (with a Redis service) on every push and pull request.

## License

[MIT](LICENSE) © 2026 Harkarman Singh
