import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Global setup talks to PostgreSQL, so it needs the same .env the apps use.
// Playwright loads this config as CommonJS, so `import.meta` is unavailable.
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  // Already provided by the environment (CI), or genuinely absent — the
  // connection check reports it clearly either way.
}

/**
 * End-to-end tests against a running stack: PostgreSQL, the API, and a
 * production build of the web app.
 *
 *   pnpm db:up
 *   pnpm --filter @journal/api dev
 *   pnpm --filter @journal/web build && pnpm --filter @journal/web start
 *
 * Deliberately not the dev server. Turbopack's HMR client and on-demand chunks
 * make hydration timing unpredictable under automation, and a test that fails
 * because a chunk was slow teaches nothing about the application.
 */

// Generated here, before global setup runs, so both the seeding step and the
// browser agree on which session they are using.
process.env['E2E_BEARER'] ??= `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
process.env['E2E_USER_ID'] ??= randomUUID();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: process.env['CI'] === undefined ? [['list']] : [['github'], ['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    // Every request carries the test session. Next forwards this header to the
    // API for server-rendered pages, and the browser sends it on client fetches.
    extraHTTPHeaders: { authorization: `Bearer ${process.env['E2E_BEARER']}` },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
