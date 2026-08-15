import { defineConfig, devices } from '@playwright/test';

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
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] === undefined ? [['list']] : [['github'], ['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
