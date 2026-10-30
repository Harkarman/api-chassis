import {afterAll, describe, expect, it} from 'vitest';
import {Queue} from '../../src/libs/queue';

const redisUrl = process.env.REDIS_URL;

// Needs a real Redis: set REDIS_URL (CI runs a Redis service).
describe.skipIf(!redisUrl)('Queue (BullMQ)', () => {
  const env = process.env.ENVIRONMENT;
  const queues: Queue[] = [];
  const make = <T>(name: string) => {
    const queue = new Queue<T>(`${name}-${process.pid}`, redisUrl!);
    queues.push(queue);
    return queue;
  };
  afterAll(async () => {
    await Promise.all(queues.map(queue => queue.close()));
    if (env === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = env;
  });

  it('processes jobs and removes completed ones', async () => {
    process.env.ENVIRONMENT = 'test';
    const queue = make<{n: number}>('emails');
    expect(queue.queue.name).toBe(`emails-${process.pid}_test`);

    const seen: number[] = [];
    const done = new Promise<void>(resolve =>
      queue.consume(async job => {
        seen.push(job.data.n);
        if (seen.length === 3) resolve();
      })
    );
    await queue.add({n: 1});
    await queue.add({n: 2});
    await queue.add({n: 3}, {}, 'custom-name');
    await done;
    expect(seen.sort()).toEqual([1, 2, 3]);

    await new Promise(resolve => setTimeout(resolve, 200));
    expect(await queue.queue.getJobCounts('completed', 'waiting')).toEqual({
      completed: 0,
      waiting: 0,
    });
  });

  it('emits failed for throwing processors', async () => {
    const queue = make<object>('fails');
    const failed = new Promise<string>(resolve =>
      queue
        .consume(async () => {
          throw new Error('boom');
        })
        .on('failed', (_job, error) => resolve(error.message))
    );
    await queue.add({});
    expect(await failed).toBe('boom');
  });

  it('names jobs after the queue by default', async () => {
    const queue = make<object>('named');
    const job = await queue.add({}, {delay: 60_000});
    expect(job.name).toBe(queue.queue.name);
    await job.remove();
  });

  it('drops the suffix in production but not preproduction', () => {
    process.env.ENVIRONMENT = 'production';
    expect(make('prod').queue.name).toBe(`prod-${process.pid}`);
    process.env.ENVIRONMENT = 'preprod';
    expect(make('pre').queue.name).toBe(`pre-${process.pid}_preprod`);
  });

  it('close() ends the Redis connection', async () => {
    const queue = new Queue('closing', redisUrl!);
    await queue.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(queue.connection.status).toBe('end');
  });
});
