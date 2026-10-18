import { defineConfig } from 'tsup';

// Bundles the server and @party/shared (which ships TypeScript source) into one ESM file.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@party\//],
});
