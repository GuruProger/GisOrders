import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'

/**
 * End-to-end suite for the real app and the local backend. The dev server is
 * reused when it is already running (`npm run dev` in another terminal);
 * otherwise Playwright starts it once and stops it afterwards.
 *
 * Run `npx playwright install chromium webkit` once before the first run.
 */
export default defineConfig({
  testDir: './e2e',
  // Creates the two test accounts through the public API on a clean database.
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // One worker keeps the test accounts under the backend login rate limit
  // and avoids two projects competing for the same proposal quota.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
})
