import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

/**
 * Tasks panel page object.
 *
 * Pending vs. completed disambiguation (both render the title text):
 *  - A **pending** task is uniquely identified by its row's Complete button
 *    `aria-label="Complete: <title>"` (see `TaskRow`).
 *  - A **completed** task is uniquely the line-through title span rendered by
 *    `CompletedRow` (Tailwind `line-through` utility) inside the Tasks region.
 *
 * No `data-testid` is added — these hooks are part of the shipped a11y surface.
 */
export class TasksPage {
  readonly page: Page;
  readonly app: AppPage;

  constructor(app: AppPage) {
    this.app = app;
    this.page = app.page;
  }

  private get input(): Locator {
    return this.page.getByLabel("New task title");
  }

  private get addButton(): Locator {
    return this.page.getByRole("button", { name: "Add task" });
  }

  /** All "Complete: <title>" buttons — one per pending row. */
  private get completeButtons(): Locator {
    return this.app.tasksRegion.locator('button[aria-label^="Complete: "]');
  }

  /** The line-through title spans rendered by `CompletedRow`. */
  private get completedTitleSpans(): Locator {
    return this.app.tasksRegion.locator("span.line-through");
  }

  /** Type a title and submit; waits for the input to clear (server accepted). */
  async addTask(title: string): Promise<void> {
    await this.input.fill(title);
    await this.addButton.click();
    // `AddTaskBar` clears the input only on a successful POST + Zod parse.
    await expect(this.input).toHaveValue("", { timeout: 10_000 });
  }

  /** Pending task titles (newest-first, mirroring the seq-desc feed order). */
  async pendingTitles(): Promise<string[]> {
    const labels = await this.completeButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    // "Complete: <title>" → "<title>"
    return labels.map((l) => l.replace(/^Complete:\s/, ""));
  }

  /** Completed task titles. */
  async completedTitles(): Promise<string[]> {
    return this.completedTitleSpans.allInnerTexts();
  }

  /** Locator that resolves only while `title` is in the Pending list. */
  pendingTask(title: string): Locator {
    return this.app.tasksRegion.locator(
      `button[aria-label="Complete: ${title}"]`,
    );
  }

  /** Locator that resolves only once `title` is in the Completed list. */
  completedTask(title: string): Locator {
    return this.completedTitleSpans.filter({ hasText: title });
  }

  /** Click the Complete button on the first pending row. */
  async completeFirstPending(): Promise<void> {
    await this.completeButtons.first().click();
  }
}
