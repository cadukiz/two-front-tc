import type { Page, Locator } from "@playwright/test";
import { AppPage } from "./AppPage";

/**
 * SMS panel page object.
 *
 * DOM facts (from `SmsBubble`): each message is a bubble whose meta line
 * carries the Fibonacci caption `Fibonacci #<i> - Next message in <m>m`. That caption is
 * unique-per-bubble and is the cleanest stable hook for counting/ordering
 * (newest-first = seq-desc, guaranteed by `liveReducer`).
 */
export class SmsPage {
  readonly page: Page;
  readonly app: AppPage;

  /** The Fibonacci caption a `SmsBubble` always renders. */
  static readonly CAPTION = /Fibonacci #\d+ - Next message in \d+m/;

  constructor(app: AppPage) {
    this.app = app;
    this.page = app.page;
  }

  /** One locator per Fibonacci caption — exactly one per SMS bubble. */
  private get captions(): Locator {
    return this.app.smsRegion.getByText(SmsPage.CAPTION);
  }

  /** Number of SMS bubbles currently rendered. */
  async count(): Promise<number> {
    return this.captions.count();
  }

  /** A SMS bubble = the flex-col wrapper holding the body box + meta line. */
  private get bubbles(): Locator {
    return this.app.smsRegion.locator("div.flex.flex-col.items-start");
  }

  /**
   * Each message's full text (body + pending titles + caption), newest-first.
   * Used to assert the pending task title rode along on the reminder.
   */
  async messages(): Promise<string[]> {
    return this.bubbles.allInnerTexts();
  }

  /**
   * Bubbles that list `title` in their pending-task body. The first SMS can
   * fire (cumulative sim-minute 1) *before* the task is added — those
   * correctly say "No pending tasks." and are not counted here. Reminders
   * that fire while the task is pending DO carry it; this locator targets
   * exactly those, so "≥3 reminders carry the task" stays a strict proof
   * that the cadence reflects live pending state (not a weakened check).
   */
  bubblesWithTitle(title: string): Locator {
    return this.bubbles.filter({ hasText: title });
  }

  /** True when at least one bubble carries the Fibonacci caption. */
  fibonacciCaption(): Locator {
    return this.captions.first();
  }

  /**
   * Inner text of the bubble at DOM position `i` (0 = newest, top of the
   * feed). Used to prove the newest-first ordering contract: a fresh SMS
   * prepends at index 0 and pushes the previous top to index 1.
   */
  async bubbleTextAt(i: number): Promise<string> {
    return this.bubbles.nth(i).innerText();
  }
}
