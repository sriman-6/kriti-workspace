import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // PGlite boots a WASM Postgres per suite; the default 5s is not enough.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` exists to fail a browser build. Tests run in Node, where
      // the guard is meaningless, so it resolves to an empty module.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
