import { defineConfig, devices } from "@playwright/test";

/**
 * SERIAL BY DESIGN. The app under test is a single shared in-memory store
 * (`globalThis`) fronted by one SSE stream — there is exactly one server and
 * one mutable global state for the whole suite. The two stateful specs both
 * drive and assert on that same store/stream, so running them in parallel
 * (`fullyParallel` / multiple workers) makes them race on shared global
 * state, producing ~10% flakes. The correct design for an inherently
 * shared-state integration suite is serial execution, not a hack: hence
 * `fullyParallel: false` + `workers: 1`. Deterministic > fast for a stateful
 * integration suite.
 *
 * Playwright config. POM (`pages/`) + the Wave 7 bonus specs (`tests/`) drive
 * the app under a compressed time model so the 1-minute summary-email cadence
 * and the Fibonacci SMS gaps are observable in E2E (ADR-0004).
 *
 * Time-model tuning (Wave 7 — determinism, NOT assertion-weakening):
 *  - `TICK_MS=1000` (was 60). One simulated minute = 1 s. Root cause that
 *    drove this: the scheduler is a real `setInterval(tick, TICK_MS)` and a
 *    *summary email fires every simulated minute*. At 60 ms that is ~17
 *    `email.created` SSE frames/s; the client `liveReducer.upsert` re-sorts
 *    the whole (≤200-cap) emails feed and React re-renders every expandable
 *    `EmailCard` on each frame. Under the Next production server + headless
 *    Chromium that render churn progressively starved the page until even
 *    trivial locator queries timed out → intermittent failures (observed at
 *    60 ms AND at 200 ms = ~5 frames/s). 1000 ms cuts the dominant flood to
 *    ~1 frame/s — the page stays responsive for the whole run. The schedule
 *    is still fully observed: SMS land at cumulative sim-minutes 1,2,4,7,12
 *    → 1/2/4/7/12 s; the first summary email ≈ 1 s.
 *  - `FIBONACCI_RESET_MINUTES=20` / `EMAIL_RESET_MINUTES=20` (were 7). 20 ≥
 *    the 5th Fibonacci gap-sum (12) so a full natural sequence 1,2,4,7,12
 *    fires *before* the reset minute (20) restarts it — the reset/`fibCycle`
 *    is still reached and observable (ADR-0005), but the SMS rate is never
 *    starved to <3 sends while the task is pending. The task is necessarily
 *    added a few sim-minutes after the scheduler starts (it starts on the
 *    first SSE connect during page load), so the title-bearing reminders the
 *    spec asserts are the later sends in this/next cycle.
 *  - Assertions are UNCHANGED and strict (see specs): the budgets are wide
 *    web-first timeouts derived from the model — no hard sleeps, no weakened
 *    checks. Whole suite ≈ 30–40 s, comfortably deterministic.
 * Next.js does not override already-set process env, so these `webServer.env`
 * values win over `apps/web/.env` (ADR-0004 note).
 */
export default defineConfig({
  testDir: "tests",
  // Serial by design — see top-of-file note. Both specs share one server +
  // one in-memory store + one SSE stream; parallel runs race on that global
  // state. Single worker, no intra-file parallelism.
  fullyParallel: false,
  workers: 1,
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
      // See the time-model tuning note above (Wave 7 determinism).
      TICK_MS: "1000",
      FIBONACCI_RESET_MINUTES: "20",
      EMAIL_RESET_MINUTES: "20",
    },
  },
});
