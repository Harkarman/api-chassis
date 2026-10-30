import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {AuthService} from '../../src/services/auth';
import {MicroService} from '../../src/services/micro-service';

interface Seen {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let baseURL = '';
let seen: Seen[] = [];
let reply: {status: number; body: string} = {status: 200, body: '{"data":{}}'};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      seen.push({method: req.method, url: req.url, headers: req.headers, body});
      res.writeHead(reply.status, {'content-type': 'application/json'});
      res.end(reply.body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));

const original = process.env.INTERNAL_TOKEN;
afterEach(() => {
  seen = [];
  reply = {status: 200, body: '{"data":{}}'};
  if (original === undefined) delete process.env.INTERNAL_TOKEN;
  else process.env.INTERNAL_TOKEN = original;
});

const client = (axiosConfig?: any) =>
  new MicroService({
    name: 'billing',
    service: 'invoices',
    baseURL,
    axiosConfig,
  });

describe('MicroService', () => {
  it('sends the internal token alongside custom headers', async () => {
    process.env.INTERNAL_TOKEN = 'secret';
    await client({headers: {'x-custom': '1'}}).find();
    expect(seen[0].headers).toMatchObject({
      internaltoken: 'secret',
      'x-custom': '1',
    });
  });

  it('sends no internal token when INTERNAL_TOKEN is unset', async () => {
    delete process.env.INTERNAL_TOKEN;
    await client().find();
    expect(seen[0].headers.internaltoken).toBeUndefined();
  });

  it('unwraps the data envelope', async () => {
    reply = {status: 200, body: '{"message":"ok","data":[{"id":1}]}'};
    expect(await client().find({status: 'open'})).toEqual([{id: 1}]);
    expect(seen[0].url).toBe('/invoices?status=open');
  });

  it('re-throws remote errors with their status', async () => {
    reply = {status: 404, body: '{"message":"no invoice"}'};
    await expect(client().get('9')).rejects.toMatchObject({
      status: 404,
      message: 'no invoice',
    });
  });

  it('returns the default value when told to handle errors', async () => {
    reply = {status: 500, body: '{}'};
    const result = await client().get(
      '9',
      {},
      {
        execption: {handle: true, defaultValue: null},
      }
    );
    expect(result).toBeNull();
  });
});

describe('AuthService.verify', () => {
  it('posts to /verify with no body and the query as params', async () => {
    await new AuthService({baseURL}).verify({scope: 'x'});
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: '/verify?scope=x',
      body: '',
    });
  });

  it('throws 401 when the auth service rejects the token', async () => {
    reply = {status: 401, body: ''};
    await expect(new AuthService({baseURL}).verify()).rejects.toMatchObject({
      status: 401,
    });
  });
});
