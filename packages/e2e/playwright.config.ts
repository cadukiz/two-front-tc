import { defineConfig, devices } from "@playwright/test";

/**
 * Wave 1 Playwright skeleton. POM (`pages/`) and specs (`tests/`) land in
 * Wave 6. The web server is started with a compressed time model so the
 * 1-minute email cadence and Fibonacci SMS gaps are observable in E2E:
 * TICK_MS=60 → one simulated minute = 60 ms.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
  ],
  webServer: {
    command: "pnpm --filter web build && pnpm --filter web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      TICK_MS: "60",
      FIBONACCI_RESET_MINUTES: "7",
      EMAIL_RESET_MINUTES: "7",
    },
  },
});
