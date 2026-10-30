import {Redis} from 'ioredis';

export class Cache {
  static client: Redis;
  static async set(key: string, value: any, expirationInSeconds = 600) {
    await Cache.client.set(
      key,
      JSON.stringify(value),
      'EX',
      expirationInSeconds
    );
  }

  static async get(key: string) {
    const cacheData = await Cache.client.get(key);
    if (!cacheData) {
      return null;
    }
    const data = JSON.parse(cacheData);

    return data;
  }

  static async delete(key: string) {
    await Cache.client.del(key);
  }
}
