import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 4173;
const BASE = `http://127.0.0.1:${PORT}`;

/* 浏览器矩阵：CI 默认跑三引擎；本地默认只跑 Chromium（多数开发机只装了它，避免默认跑出三个红叉）。
   选择性执行：`E2E_BROWSERS=firefox npm run test:e2e`，或 `npx playwright test --project=webkit`。 */
const BROWSERS = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } }
];
const wanted = (process.env.E2E_BROWSERS || (process.env.CI ? 'chromium,firefox,webkit' : 'chromium'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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
  projects: BROWSERS.filter((p) => wanted.includes(p.name)),
  use: {
    baseURL: BASE,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node tests/e2e/static-server.mjs',
    url: `${BASE}/shotflow.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 15000
  }
});
