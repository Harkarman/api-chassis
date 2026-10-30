import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests start real servers in child processes.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
