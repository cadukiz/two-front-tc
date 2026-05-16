import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/AppPage";
import { TasksPage } from "../pages/TasksPage";
import { EmailsPage } from "../pages/EmailsPage";

/**
 * Bonus B2 — complete-task-from-email round-trip, Page Object Model.
 *
 * Proves the email action drives domain state via the GET email-link adapter
 * (`GET /api/tasks/:id/complete`, the exact path a mail client would open),
 * that the action is reachable WITHOUT expanding the card (RC1 fix, ADR-0010),
 * that **every** notification email is actionable (RC2: both `immediate` and
 * `summary`), and that the result reflects back through SSE into BOTH panels.
 *
 * The tests never POST and never optimistically mutate the UI — if the GET
 * adapter, the idempotent completion, or the SSE reflection broke, they fail.
 */
test("B2 (immediate): complete from the immediate email round-trips through SSE — no expand", async ({
  page,
}) => {
  const app = new AppPage(page);
  const tasks = new TasksPage(app);
  const emails = new EmailsPage(app);

  await app.goto();

  const TITLE = "E2E round trip";
  await tasks.addTask(TITLE);

  // Precondition: the task is Pending and not yet Completed.
  await expect(tasks.pendingTask(TITLE)).toBeVisible({ timeout: 10_000 });
  await expect(tasks.completedTask(TITLE)).toHaveCount(0);

  // RC1: the immediate card's "Mark complete" is visible WITHOUT expanding;
  // the card header stays collapsed (aria-expanded=false) the whole time.
  const header = emails.immediateFor(TITLE).first().getByRole("button").first();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await emails.clickMarkCompleteOn(TITLE);
  await expect(header).toHaveAttribute("aria-expanded", "false");

  // The completion reflects back via SSE: the task leaves Pending and lands
  // in Completed (server-authoritative — no optimistic UI mutation).
  await expect(tasks.completedTask(TITLE)).toBeVisible({ timeout: 15_000 });
  await expect(tasks.pendingTask(TITLE)).toHaveCount(0);
  expect(await tasks.completedTitles()).toContain(TITLE);
  expect(await tasks.pendingTitles()).not.toContain(TITLE);

  // The immediate email's action flips to its done/disabled state, driven by
  // the same SSE `task.completed` frame (the id leaves `pendingTaskIds`).
  const doneBtn = emails.completedActionFor(TITLE);
  await expect(doneBtn).toBeVisible({ timeout: 10_000 });
  await expect(doneBtn).toBeDisabled();
});

test("B2 (summary): a summary email exposes a per-task 'Mark complete' that round-trips through SSE — no expand", async ({
  page,
}) => {
  const app = new AppPage(page);
  const tasks = new TasksPage(app);
  const emails = new EmailsPage(app);

  await app.goto();

  const TITLE = "E2E summary round trip";
  await tasks.addTask(TITLE);
  await expect(tasks.pendingTask(TITLE)).toBeVisible({ timeout: 10_000 });

  // A summary email fires every minute (compressed TICK_MS). Wait for one that
  // lists this still-pending task: its per-task "Mark complete" control is
  // visible WITHOUT expanding the card (RC1).
  const summaryAction = emails.summaryMarkCompleteFor(TITLE);
  await expect(summaryAction).toBeVisible({ timeout: 20_000 });
  const summaryHeader = emails.anySummary().getByRole("button").first();
  await expect(summaryHeader).toHaveAttribute("aria-expanded", "false");

  // Drive the per-task email-link adapter from the summary email itself.
  await summaryAction.click();
  await expect(summaryHeader).toHaveAttribute("aria-expanded", "false");

  // The completion reflects back via SSE into the Tasks panel.
  await expect(tasks.completedTask(TITLE)).toBeVisible({ timeout: 15_000 });
  await expect(tasks.pendingTask(TITLE)).toHaveCount(0);
  expect(await tasks.completedTitles()).toContain(TITLE);

  // And the round-trip is visibly validated on a summary email: the newest
  // summary either no longer lists the now-completed task, or shows it in the
  // disabled "Completed" state — never as an active "Mark complete" again.
  await expect(emails.summaryMarkCompleteFor(TITLE)).toHaveCount(0, {
    timeout: 15_000,
  });
});
