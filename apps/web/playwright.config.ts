import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack. They assume the API and PostgreSQL
 * are already up — `pnpm db:up` then the dev servers — because the point is to
 * exercise the real thing, not a mocked one.
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
