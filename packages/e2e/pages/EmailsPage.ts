import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

/**
 * Emails panel page object (Wave 11 / ADR-0010).
 *
 * DOM facts (from `EmailCard`):
 *  - Each email is an `<article>` whose header is a toggle `button`
 *    (`aria-expanded`) containing the kind badge ("Immediate" / "Summary")
 *    and the subject text.
 *  - Immediate subject = `New task: "<title>"`; Summary subject =
 *    `Pending tasks summary`.
 *  - RC1 fix: the complete action is rendered in the ALWAYS-VISIBLE
 *    (collapsed) layout — NO expand is required to find or click it. Each
 *    control is a `button` with `aria-label="Mark complete: <label>"` (or the
 *    disabled `aria-label="Completed: <label>"` once its task is done).
 *  - `immediate` → one control whose label is the email subject. `summary` →
 *    one control per pending entry whose label is that task's title.
 */
export class EmailsPage {
  readonly page: Page;
  readonly app: AppPage;

  constructor(app: AppPage) {
    this.app = app;
    this.page = app.page;
  }

  private get articles(): Locator {
    return this.app.emailsRegion.locator("article");
  }

  /** Every email as `{ kind, subject }`, newest-first (seq-desc feed order). */
  async emails(): Promise<{ kind: "immediate" | "summary"; subject: string }[]> {
    const count = await this.articles.count();
    const out: { kind: "immediate" | "summary"; subject: string }[] = [];
    for (let i = 0; i < count; i++) {
      const header = this.articles.nth(i).getByRole("button").first();
      const text = (await header.innerText()).trim();
      const kind: "immediate" | "summary" = /^Immediate/i.test(text)
        ? "immediate"
        : "summary";
      // Header text is "Immediate|Summary\n<subject>\n<time>"; the subject is
      // the line that is neither the badge nor the time.
      const subject = text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .find((s) => !/^(Immediate|Summary)$/i.test(s) && !/^\d/.test(s));
      out.push({ kind, subject: subject ?? text });
    }
    return out;
  }

  /** The immediate-email `<article>` for a given task title. */
  immediateFor(title: string): Locator {
    return this.articles.filter({
      has: this.page.getByRole("button", {
        name: new RegExp(`Immediate.*New task: "${escapeRegExp(title)}"`, "s"),
      }),
    });
  }

  /** Any *summary* email card (subject is the fixed "Pending tasks summary"). */
  anySummary(): Locator {
    return this.articles
      .filter({
        has: this.page.getByRole("button", {
          name: /Summary.*Pending tasks summary/s,
        }),
      })
      .first();
  }

  /**
   * The active "Mark complete" control inside the immediate card for `title`
   * (label = the email subject `New task: "<title>"`). Visible WITHOUT expand.
   */
  markCompleteOnImmediate(title: string): Locator {
    return this.immediateFor(title)
      .first()
      .getByRole("button", { name: `Mark complete: New task: "${title}"` });
  }

  /** Expand the immediate card is NOT required — click its action directly. */
  async clickMarkCompleteOn(title: string): Promise<void> {
    const article = this.immediateFor(title).first();
    await expect(article).toBeVisible({ timeout: 15_000 });
    const btn = this.markCompleteOnImmediate(title);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  /** The "Completed" (done/disabled) action button in the immediate card. */
  completedActionFor(title: string): Locator {
    return this.immediateFor(title)
      .first()
      .getByRole("button", { name: `Completed: New task: "${title}"` });
  }

  /**
   * A per-task "Mark complete" control inside ANY summary email for the task
   * titled `title` (label = the task title). Visible WITHOUT expand.
   */
  summaryMarkCompleteFor(title: string): Locator {
    return this.anySummary().getByRole("button", {
      name: `Mark complete: ${title}`,
    });
  }

  /** The done/disabled per-task control for `title` in ANY summary email. */
  summaryCompletedFor(title: string): Locator {
    return this.anySummary().getByRole("button", {
      name: `Completed: ${title}`,
    });
  }

  /** Filter helper — click one of the All/Immediate/Summary tabs. */
  async filterBy(kind: "All" | "Immediate" | "Summary"): Promise<void> {
    await this.app.emailsRegion
      .page()
      .getByRole("tab", { name: new RegExp(`^${kind}`) })
      .click();
  }

  /** Count of currently-rendered email cards. */
  async count(): Promise<number> {
    return this.articles.count();
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
