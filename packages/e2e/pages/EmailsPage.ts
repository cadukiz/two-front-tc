import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

/**
 * Emails panel page object.
 *
 * DOM facts (from `EmailCard`):
 *  - Each email is an `<article>` whose header is a toggle `button`
 *    (`aria-expanded`) containing the kind badge ("Immediate" / "Summary")
 *    and the subject text.
 *  - Immediate subject = `New task: "<title>"`; Summary subject =
 *    `Pending tasks summary`.
 *  - The body + the "Mark complete" / "Completed" action are only mounted
 *    while the card is expanded, so we must expand before driving the action.
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

  /** Expand a card's header so its body/action mounts. */
  private async expand(article: Locator): Promise<void> {
    const header = article.getByRole("button").first();
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
      await expect(header).toHaveAttribute("aria-expanded", "true");
    }
  }

  /** Expand the immediate email for `title` and click its "Mark complete". */
  async clickMarkCompleteOn(title: string): Promise<void> {
    const article = this.immediateFor(title).first();
    await expect(article).toBeVisible({ timeout: 15_000 });
    await this.expand(article);
    const btn = article.getByRole("button", { name: "Mark complete" });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  /** The "Completed" (done/disabled) action button in the immediate card. */
  completedActionFor(title: string): Locator {
    return this.immediateFor(title)
      .first()
      .getByRole("button", { name: "Completed" });
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
