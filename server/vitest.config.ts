import { defineConfig } from 'vitest/config';

/**
 * API tests. They run against PGlite - Postgres compiled to WebAssembly,
 * in-process and in memory - with every migration applied.
 *
 * DATABASE_URL below points at a port nothing listens on, on purpose: the
 * tests replace the connection pool before any query runs, and if one ever
 * slipped past, it could not reach a real database. Never point this at
 * Supabase.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@127.0.0.1:1/never_connects?sslmode=disable',
      DIRECT_URL: 'postgres://test:test@127.0.0.1:1/never_connects?sslmode=disable',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      ADMIN_API_KEY: 'test-admin-key',
      CORS_ORIGIN: 'http://localhost:8080',
      EMAIL_PROVIDER: 'log',
      ADMIN_NOTIFY_EMAIL: 'developer@example.test',
      APP_URL: 'https://campus.example.test',
    },
  },
});
