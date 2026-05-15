import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/AppPage";
import { TasksPage } from "../pages/TasksPage";
import { EmailsPage } from "../pages/EmailsPage";

/**
 * Bonus B2 — complete-task-from-email round-trip, Page Object Model.
 *
 * Proves the email action drives domain state via the GET email-link adapter
 * (`GET /api/tasks/:id/complete`, the exact path a mail client would open),
 * and that the result reflects back through SSE into BOTH panels:
 *   add task → in the Emails panel, expand its immediate email → click
 *   "Mark complete" → the task moves Pending → Completed in the Tasks panel
 *   AND the email's action flips from "Mark complete" to the disabled
 *   "Completed" state.
 *
 * If the GET adapter, the idempotent completion, or the SSE reflection broke,
 * this test fails (it never POSTs and never optimistically mutates the UI).
 */
test("B2: completing a task from its immediate email round-trips through SSE", async ({
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

  // Drive the email action (expands the immediate card, clicks "Mark
  // complete" → fires the GET email-link adapter).
  await emails.clickMarkCompleteOn(TITLE);

  // The completion reflects back via SSE: the task leaves Pending and lands
  // in Completed (server-authoritative — no optimistic UI mutation).
  await expect(tasks.completedTask(TITLE)).toBeVisible({ timeout: 15_000 });
  await expect(tasks.pendingTask(TITLE)).toHaveCount(0);
  expect(await tasks.completedTitles()).toContain(TITLE);
  expect(await tasks.pendingTitles()).not.toContain(TITLE);

  // The email's action flips to its done/disabled state ("Completed"),
  // driven by the same SSE `task.completed` frame (`taskStillPending`→false).
  const doneBtn = emails.completedActionFor(TITLE);
  await expect(doneBtn).toBeVisible({ timeout: 10_000 });
  await expect(doneBtn).toBeDisabled();
});
