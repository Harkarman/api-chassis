import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node26',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
});
