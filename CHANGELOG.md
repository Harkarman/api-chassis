# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0.0, minor releases may contain breaking changes.

## Unreleased

## 0.1.0 - 2026-10-30

First release of api-chassis.

### Added

- File-system service registration: each folder (or single file) in `services/` becomes a REST resource with `find`, `get`, `create`, `update`, `patch` and `remove` routes.
- `ChassisService`, backed by PostgreSQL through Drizzle. It works with drizzle-orm 0.45 and 1.x, because it only uses the core query builders. Query strings support column filters, the `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$like` and `$ilike` operators, `$limit` and `$offset`, plus optional `{rows, count}` pagination and a `primaryKey` override.
- `this.db` and `this.toDrizzleQuery(query)` for custom Postgres queries (joins, aggregates, raw SQL) that accept the same query strings as the generic routes.
- Per-method validation with Joi-style schemas. The validated value, with defaults and conversions applied, is what the service receives.
- `before`, `after` and `all` hooks, with the built-in `disallow`, `externalDisallow` and `loggedIn` hooks and a `findRequest` helper.
- `HttpError` and the `BadRequest`, `Unauthorized`, `PaymentRequired`, `Forbidden`, `NotFound`, `NoContent` and `InternalServer` classes, plus `isHttpError`.
- Micro-service clients declared in `micro-services/`, built on axios.
- Token authentication through an external `/verify` endpoint, with an optional `auth.payload` schema that the token's claims must match. The validated payload becomes `req.user`.
- Redis cache, BullMQ queues (`Queue.add`, `Queue.consume`, `Queue.close`), Socket.IO with an optional Redis adapter, Sentry, winston logging, `/healthz` and a JSON 404.
- `Chassis.ready`, which resolves once the server is listening, and a `SERVER_STARTED` event carrying the actual port.
- CommonJS and ESM builds with TypeScript declarations. Requires Node.js 26 or newer and Express 5.

### Security

- Internal service-to-service requests are only trusted when `INTERNAL_TOKEN` is set. There's no default token, and the comparison is constant-time.
- `Authorization`, `Proxy-Authorization`, `Cookie` and `internaltoken` headers are left out of request logs.
- JWT payloads are only read after the auth service's `/verify` endpoint has accepted the token.
- A service, model, validator or hooks file that fails to load stops startup with a logged error, rather than being silently skipped.
