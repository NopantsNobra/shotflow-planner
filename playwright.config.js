import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 4173;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'node tests/e2e/static-server.mjs',
    url: `${BASE}/shotflow.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000
  }
});
