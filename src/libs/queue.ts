import {
  Queue as BullQueue,
  Worker,
  type Job,
  type JobsOptions,
  type QueueOptions as BullQueueOptions,
  type RateLimiterOptions,
  type WorkerOptions,
} from 'bullmq';
import {Redis} from 'ioredis';
import {Logger} from '../logger';

export interface QueueOptions extends Omit<BullQueueOptions, 'connection'> {
  /** Default rate limit for workers started with `consume`. */
  limiter?: RateLimiterOptions;
}

export type ConsumeOptions = Partial<Omit<WorkerOptions, 'connection'>>;

export class Queue<T = any> {
  readonly queue: BullQueue<T, any, string, T, any, string>;
  readonly connection: Redis;
  private readonly queueName: string;
  private readonly limiter: RateLimiterOptions;
  private readonly workers: Worker<T>[] = [];

  constructor(name: string, redisUrl: string, opts: QueueOptions = {}) {
    const {limiter = {duration: 50000, max: 30}, ...queueOpts} = opts;
    const env = process.env.ENVIRONMENT ?? 'dev';
    let queueName = `${name}_${env}`;
    if (/prod/gi.test(env) && !/pre/gi.test(env)) {
      queueName = name;
    }
    // BullMQ can't load ioredis itself under native ESM, and workers need
    // maxRetriesPerRequest: null on their blocking connection.
    this.connection = new Redis(redisUrl, {maxRetriesPerRequest: null});
    this.queue = new BullQueue<T, any, string, T, any, string>(queueName, {
      ...queueOpts,
      connection: this.connection,
    });
    this.queueName = queueName;
    this.limiter = limiter;
  }

  async add(data: T, opts?: JobsOptions, jobName: string = this.queueName) {
    const options: JobsOptions = {
      removeOnComplete: true, // removes job from queue on success
      removeOnFail: true, // removes job from queue on failure,
      attempts: 1,
      ...(opts ?? {}),
    };
    return this.queue.add(jobName, data, options);
  }

  /** Starts a worker that runs `processor` for each job. */
  consume<R = any>(
    processor: (job: Job<T, R>) => Promise<R>,
    opts: ConsumeOptions = {}
  ): Worker<T, R> {
    const queueName = this.queueName;
    const worker = new Worker<T, R>(queueName, processor, {
      limiter: this.limiter,
      ...opts,
      connection: this.connection,
    });

    worker.on('completed', function (job, result) {
      const payload = {job, result};
      Logger.info(`Completed ${queueName}: `, payload);
    });

    worker.on('failed', function (job, error) {
      const payload = {job, error};
      Logger.info(`Failed ${queueName}: `, payload);
    });

    worker.on('error', function (error) {
      Logger.error(`Worker error ${queueName}: `, error);
    });

    this.workers.push(worker as Worker<any>);
    return worker;
  }

  /** Closes the queue, its workers and the Redis connection. */
  async close() {
    await Promise.all(this.workers.map(worker => worker.close()));
    await this.queue.close();
    await this.connection.quit();
  }
}
