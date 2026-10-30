import {fork, type ChildProcess} from 'node:child_process';
import path from 'node:path';

export const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

export type Format = 'cjs' | 'esm';

export interface StartOptions {
  fixture: 'app' | 'pg-app' | 'broken-app';
  format: Format;
  /** Passed to `new Chassis(...)`. Fixtures with a schema.mjs also get an in-memory Postgres. */
  config?: Record<string, unknown>;
  /** Extra env vars. INTERNAL_TOKEN is only set when given here. */
  env?: Record<string, string>;
}

export interface RunningApp {
  url: string;
  child: ChildProcess;
  output: () => string;
  stop: () => Promise<void>;
  request: (
    method: string,
    pathname: string,
    init?: {body?: unknown; headers?: Record<string, string>}
  ) => Promise<{status: number; json: any}>;
}

function childEnv(options: StartOptions) {
  const env: Record<string, string | undefined> = {...process.env};
  delete env.INTERNAL_TOKEN;
  return {
    ...env,
    PORT: '0',
    CHASSIS_ROOT: path.join(FIXTURES, options.fixture),
    CHASSIS_CONFIG: JSON.stringify(options.config ?? {}),
    ...options.env,
  };
}

/** Runs a fixture app in its own process against the built package. */
export function startApp(options: StartOptions): Promise<RunningApp> {
  const entry = path.join(
    FIXTURES,
    options.format === 'esm' ? 'start.mjs' : 'start.cjs'
  );
  const child = fork(entry, [], {
    env: childEnv(options),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout?.on('data', chunk => (output += chunk));
  child.stderr?.on('data', chunk => (output += chunk));

  return new Promise((resolve, reject) => {
    child.once('exit', code =>
      reject(new Error(`app exited with code ${code}\n${output}`))
    );
    child.once('message', (message: any) => {
      const url = `http://127.0.0.1:${message.port}`;
      resolve({
        url,
        child,
        output: () => output,
        stop: () =>
          new Promise(done => {
            if (child.exitCode !== null) return done();
            child.once('exit', () => done());
            child.kill();
          }),
        request: async (method, pathname, init = {}) => {
          const res = await fetch(url + pathname, {
            method,
            headers: {'content-type': 'application/json', ...init.headers},
            body:
              init.body === undefined ? undefined : JSON.stringify(init.body),
          });
          const text = await res.text();
          let json: any = text;
          try {
            json = JSON.parse(text);
          } catch {
            // not JSON
          }
          return {status: res.status, json};
        },
      });
    });
  });
}

/** Waits for a fixture app that is expected to fail at startup. */
export function startAppExpectingFailure(
  options: StartOptions
): Promise<{code: number | null; output: string}> {
  return startApp(options).then(
    async app => {
      await app.stop();
      throw new Error('app started but was expected to fail');
    },
    (error: Error) => {
      const match = /exited with code (\S+)\n([\s\S]*)/.exec(error.message);
      if (!match) throw error;
      return {code: Number(match[1]), output: match[2]};
    }
  );
}

/** An unsigned JWT-shaped token with the given payload. */
export function fakeJwt(payload: object) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({alg: 'none'})}.${part(payload)}.signature`;
}
