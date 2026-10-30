import {describe, expect, it, vi} from 'vitest';
import {Cache} from '../../src/libs/cache';

describe('Cache.set', () => {
  it('stores the value and its expiry in one command', async () => {
    const client = {set: vi.fn(), expire: vi.fn()};
    Cache.client = client as any;
    await Cache.set('key', {a: 1}, 60);
    expect(client.set).toHaveBeenCalledWith('key', '{"a":1}', 'EX', 60);
    expect(client.expire).not.toHaveBeenCalled();
  });
});
