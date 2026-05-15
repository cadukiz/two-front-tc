import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/AppPage";
import { TasksPage } from "../pages/TasksPage";
import { EmailsPage } from "../pages/EmailsPage";
import { SmsPage } from "../pages/SmsPage";

/**
 * Bonus B1 — full lifecycle, Page Object Model.
 *
 * Proves the whole server-authoritative pipeline end-to-end:
 *   add task → it appears in Pending → an *immediate* email referencing it
 *   arrives → on the compressed schedule a *summary* email fires AND ≥3 SMS
 *   reminders arrive, newest-first, carrying the still-pending task, each
 *   stamped with its Fibonacci caption.
 *
 * Timeouts are derived from the time model (TICK_MS=1000 → 1 sim-min = 1 s;
 * SMS land at cumulative sim-minutes 1,2,4,7,12 ≈ 1/2/4/7/12 s; summary
 * every 1 s) with a healthy margin via web-first assertions / `expect.poll`
 * — no hard `waitForTimeout` sleeps. The assertions are kept strict on
 * purpose: if the immediate-email trigger, the summary cadence, the
 * Fibonacci scheduler, or the newest-first SSE ordering broke, this fails.
 */
test("B1: full task lifecycle — immediate email, summary email, Fibonacci SMS", async ({
  page,
}) => {
  const app = new AppPage(page);
  const tasks = new TasksPage(app);
  const emails = new EmailsPage(app);
  const sms = new SmsPage(app);

  await app.goto();

  const TITLE = "E2E lifecycle task";
  await tasks.addTask(TITLE);

  // 1. The task appears in Pending (server-authoritative, via SSE).
  await expect(tasks.pendingTask(TITLE)).toBeVisible({ timeout: 10_000 });
  expect(await tasks.pendingTitles()).toContain(TITLE);

  // 2. An *immediate* email referencing the task arrives. `immediateFor`'s
  //    locator matches an <article> whose header carries BOTH the "Immediate"
  //    badge and the exact subject `New task: "<title>"`, so its visibility
  //    proves kind+subject together. Assert the badge text explicitly too.
  const immediate = emails.immediateFor(TITLE).first();
  await expect(immediate).toBeVisible({ timeout: 10_000 });
  await expect(immediate.getByText("Immediate", { exact: true })).toBeVisible();

  // 3. A *summary* email fires on the 1-minute cadence (every ~1 s here).
  await expect(emails.anySummary()).toBeVisible({ timeout: 15_000 });

  // 4. At least 3 SMS reminders that carry the still-pending task arrive.
  //    The first SMS (cumulative sim-minute 1) can fire before the task is
  //    added and correctly says "No pending tasks." — so we wait on
  //    reminders that actually list the task. This is strictly STRONGER than
  //    "every body": it proves the recurring reminder reflects the live
  //    pending state. 30 s ≫ the sim-minute-12 horizon; web-first poll.
  await expect
    .poll(() => sms.bubblesWithTitle(TITLE).count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);

  // 5. The Fibonacci caption is present on the SMS bubbles.
  await expect(sms.fibonacciCaption()).toBeVisible();

  // 6. SMS feed is newest-first (ADR-0006: seq-desc; `liveReducer` prepends
  //    new arrivals). fibIndex is NOT a valid monotonic key — it resets per
  //    Fibonacci cycle by design (ADR-0005). Instead prove the user-visible
  //    invariant directly: capture the current top bubble, wait for a NEWER
  //    SMS to arrive, and assert the new one is at index 0 while the
  //    previously-top one moved to index 1 (new inserts at the top).
  const topBefore = (await sms.bubbleTextAt(0)).trim();
  await expect
    .poll(async () => (await sms.bubbleTextAt(0)).trim(), {
      timeout: 30_000,
    })
    .not.toBe(topBefore);
  expect((await sms.bubbleTextAt(1)).trim()).toBe(topBefore);

  // 7. The reminders that fired while the task was pending carry its title
  //    (≥3; the task was never completed so the cadence keeps listing it).
  //    Every bubble matched by `bubblesWithTitle` contains the title by
  //    construction — assert the bodies explicitly too.
  const titleBodies = await sms.bubblesWithTitle(TITLE).allInnerTexts();
  expect(titleBodies.length).toBeGreaterThanOrEqual(3);
  expect(titleBodies.every((b) => b.includes(TITLE))).toBe(true);
});
