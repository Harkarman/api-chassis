import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  fakeJwt,
  startApp,
  startAppExpectingFailure,
  type Format,
  type RunningApp,
} from '../helpers/start-app';

describe.each<Format>(['cjs', 'esm'])('%s build', format => {
  let app: RunningApp;
  beforeAll(async () => {
    app = await startApp({fixture: 'app', format});
  });
  afterAll(() => app?.stop());

  it('runs CRUD through the Mongo adapter', async () => {
    const created = await app.request('POST', '/widgets', {
      body: {name: 'bolt', price: '10'},
    });
    expect(created.status).toBe(200);
    const id = created.json.data._id;

    expect(
      (await app.request('GET', `/widgets/${id}`)).json.data
    ).toMatchObject({name: 'bolt'});

    const patched = await app.request('PATCH', `/widgets/${id}`, {
      body: {price: 20},
    });
    expect(patched.json.data.price).toBe(20);

    const removed = await app.request('DELETE', `/widgets/${id}`);
    expect(removed.json.data._id).toBe(id);
  });

  it('passes the validated value on to the service', async () => {
    const res = await app.request('POST', '/widgets', {
      body: {name: 'nut', price: '7'},
    });
    expect(res.json.data).toMatchObject({price: 7, validated: true});
  });

  it('rejects invalid bodies with 400', async () => {
    const res = await app.request('POST', '/widgets', {body: {}});
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/name/);
  });

  it('parses nested query strings', async () => {
    await app.request('POST', '/widgets', {body: {name: 'big', price: 100}});
    const res = await app.request('GET', '/widgets?price[$gt]=50');
    expect(res.json.data.map((w: any) => w.name)).toEqual(['big']);
  });

  it('lets after hooks replace object and array results', async () => {
    const {json} = await app.request('POST', '/widgets', {
      body: {name: 'hooked'},
    });
    const got = await app.request('GET', `/widgets/${json.data._id}`);
    expect(got.json.data.hooked).toBe(true);

    const list = await app.request('GET', '/widgets');
    expect(list.json.data.length).toBeGreaterThan(0);
    expect(list.json.data.every((w: any) => w.listed === true)).toBe(true);
  });

  it('responds 400 for a missing record', async () => {
    const res = await app.request('GET', '/widgets/999');
    expect(res.status).toBe(400);
    expect(res.json.message).toBe('No record found for 999');
  });

  it('maps thrown errors to statuses', async () => {
    expect((await app.request('GET', '/boom')).status).toBe(500);

    const thrownError = await app.request('GET', '/boom/1');
    expect(thrownError).toEqual({
      status: 500,
      json: {message: 'Something went wrong'},
    });

    expect(await app.request('POST', '/boom', {body: {}})).toEqual({
      status: 400,
      json: {message: 'nope'},
    });
    expect(await app.request('PUT', '/boom/1', {body: {}})).toEqual({
      status: 409,
      json: {message: 'conflict'},
    });
  });

  it('runs before hooks such as disallow', async () => {
    expect((await app.request('DELETE', '/boom/1')).status).toBe(404);
  });

  it('loggedIn rejects anonymous requests', async () => {
    expect((await app.request('GET', '/members')).status).toBe(401);
  });

  it('mounts single-file services without their extension', async () => {
    expect((await app.request('GET', '/flat')).json.data).toEqual([
      {flat: true},
    ]);
    expect((await app.request('GET', '/flat.cjs')).status).toBe(404);
  });

  it('serves /healthz and a JSON 404', async () => {
    expect((await app.request('GET', '/healthz')).json.message).toBe('ok');
    expect(await app.request('GET', '/nope')).toEqual({
      status: 404,
      json: {message: 'Not found'},
    });
  });
});

describe('postgres dialect', () => {
  let app: RunningApp;
  beforeAll(async () => {
    app = await startApp({
      fixture: 'pg-app',
      format: 'cjs',
      config: {database: {dialect: 'postgres', instance: 'fake'}},
    });
  });
  afterAll(() => app?.stop());

  it('builds models from the factory and runs CRUD', async () => {
    const created = await app.request('POST', '/orders', {body: {total: 5}});
    expect(created.json.data).toMatchObject({id: '1', total: 5});
    expect((await app.request('GET', '/orders/1')).json.data.total).toBe(5);
    expect((await app.request('GET', '/orders')).json.data).toHaveLength(1);
  });

  it('honours a `pagination = true` class field', async () => {
    await app.request('POST', '/paged', {body: {total: 1}});
    const res = await app.request('GET', '/paged');
    expect(res.json.data).toMatchObject({count: 1});
    expect(res.json.data.rows).toHaveLength(1);
  });
});

describe('authentication', () => {
  const good = fakeJwt({sub: 'u1', business: 'b1'});
  const noBusiness = fakeJwt({sub: 'x'});
  let authServer: http.Server;
  let authUrl = '';
  const verifyBodies: string[] = [];

  beforeAll(async () => {
    authServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        verifyBodies.push(body);
        const token = req.headers.authorization?.replace('Bearer ', '');
        const ok =
          req.url === '/verify' && (token === good || token === noBusiness);
        res.writeHead(ok ? 200 : 401).end(ok ? '{"data":{}}' : '');
      });
    });
    await new Promise<void>(resolve => authServer.listen(0, resolve));
    authUrl = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise(resolve => authServer.close(resolve)));

  // 'fixture' is swapped for test/fixtures/auth-payload.mjs, which requires a
  // `business` claim and renames it to `businessId`.
  const config = (payload?: 'fixture') => ({
    auth: {required: true, baseURL: authUrl, ...(payload ? {payload} : {})},
  });

  describe('with INTERNAL_TOKEN set and a payload schema', () => {
    let app: RunningApp;
    beforeAll(async () => {
      app = await startApp({
        fixture: 'app',
        format: 'cjs',
        config: config('fixture'),
        env: {INTERNAL_TOKEN: 's3cret-token'},
      });
    });
    afterAll(() => app?.stop());

    it('requires an Authorization header', async () => {
      expect((await app.request('GET', '/secure')).status).toBe(401);
    });

    it('passes on a 401 from the auth service as 401', async () => {
      const res = await app.request('GET', '/secure', {
        headers: {authorization: 'Bearer not-a-real-token'},
      });
      expect(res.status).toBe(401);
    });

    it('rejects verified tokens whose payload fails the schema', async () => {
      const res = await app.request('GET', '/secure', {
        headers: {authorization: `Bearer ${noBusiness}`},
      });
      expect(res).toEqual({
        status: 401,
        json: {message: "You don't have permission"},
      });
    });

    it('sets req.user to the validated payload', async () => {
      const res = await app.request('GET', '/secure', {
        headers: {authorization: `Bearer ${good}`},
      });
      expect(res.status).toBe(200);
      expect(res.json.data[0].user).toEqual({sub: 'u1', businessId: 'b1'});
    });

    it('calls /verify without a request body', () => {
      expect(verifyBodies.length).toBeGreaterThan(0);
      expect(verifyBodies.every(body => body === '')).toBe(true);
    });

    it('skips auth for the matching internal token only', async () => {
      const ok = await app.request('GET', '/secure', {
        headers: {internaltoken: 's3cret-token'},
      });
      expect(ok.status).toBe(200);
      const wrong = await app.request('GET', '/secure', {
        headers: {internaltoken: 'internal_token'},
      });
      expect(wrong.status).toBe(401);
    });

    it('skips auth for services with auth = false', async () => {
      expect((await app.request('GET', '/open')).status).toBe(200);
    });

    it('externalDisallow admits only internal requests', async () => {
      const external = await app.request('GET', '/internal', {
        headers: {authorization: `Bearer ${good}`},
      });
      expect(external.status).toBe(404);
      const internal = await app.request('GET', '/internal', {
        headers: {internaltoken: 's3cret-token'},
      });
      expect(internal.status).toBe(200);
    });

    it('loggedIn admits authenticated requests', async () => {
      const res = await app.request('GET', '/members', {
        headers: {authorization: `Bearer ${good}`},
      });
      expect(res.status).toBe(200);
      expect(res.json.data[0].user).toEqual({sub: 'u1', businessId: 'b1'});
    });

    it('keeps credentials out of the logs', () => {
      expect(app.output()).toContain('GET /secure');
      expect(app.output()).not.toContain('s3cret-token');
      expect(app.output()).not.toContain(good);
    });
  });

  describe('without INTERNAL_TOKEN or a payload schema', () => {
    let app: RunningApp;
    beforeAll(async () => {
      app = await startApp({fixture: 'app', format: 'esm', config: config()});
    });
    afterAll(() => app?.stop());

    it('does not accept the old default token', async () => {
      const res = await app.request('GET', '/secure', {
        headers: {internaltoken: 'internal_token'},
      });
      expect(res.status).toBe(401);
      const hidden = await app.request('GET', '/internal', {
        headers: {
          internaltoken: 'internal_token',
          authorization: `Bearer ${good}`,
        },
      });
      expect(hidden.status).toBe(404);
    });

    it('accepts any verified payload as req.user', async () => {
      const res = await app.request('GET', '/secure', {
        headers: {authorization: `Bearer ${noBusiness}`},
      });
      expect(res.status).toBe(200);
      expect(res.json.data[0].user).toEqual({sub: 'x'});
    });

    it('warns at startup', () => {
      expect(app.output()).toContain('INTERNAL_TOKEN is not set');
    });
  });
});

describe.each<Format>(['cjs', 'esm'])('broken service files (%s)', format => {
  it('fail startup instead of being skipped', async () => {
    const {code, output} = await startAppExpectingFailure({
      fixture: 'broken-app',
      format,
    });
    expect(code).not.toBe(0);
    expect(output).toContain('api-chassis failed to start');
    expect(output).toContain('api-chassis-test-missing-package');
  });
});
