import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Root Page Object for the TwoFront workbench (Wave 7 bonus B1/B2).
 *
 * Selector strategy (no `data-testid` was needed — the ported components
 * already expose stable roles / aria-labels / text):
 *  - Tasks region   → `[aria-label="Tasks"]` (the `aria-live` feed in `Workbench`).
 *  - Emails region  → `[aria-label="Emails"]`.
 *  - SMS region     → `[aria-label="SMS messages"]`.
 *  - "Live stream"   → the `AppHeader` connection pill text once SSE is open.
 *
 * Everything else is reached through these three panel roots so the page
 * objects compose without leaking selectors into the specs.
 */
export class AppPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to the app and wait until the SSE stream is live (deterministic start). */
  async goto(): Promise<void> {
    await this.page.goto("/");
    // The connection pill flips to "Live stream" once `EventSource` is open.
    // Waiting on this guarantees the scheduler/SSE are wired before we assert,
    // so the compressed cadence is observed from a known baseline.
    await expect(
      this.page.getByText("Live stream", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** The Tasks panel feed region (`aria-live="polite"`). */
  get tasksRegion(): Locator {
    return this.page.locator('[aria-label="Tasks"]');
  }

  /** The Emails panel feed region (`aria-live="polite"`). */
  get emailsRegion(): Locator {
    return this.page.locator('[aria-label="Emails"]');
  }

  /** The SMS panel feed region (`aria-live="polite"`). */
  get smsRegion(): Locator {
    return this.page.locator('[aria-label="SMS messages"]');
  }
}
