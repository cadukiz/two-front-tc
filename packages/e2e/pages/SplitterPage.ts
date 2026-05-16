import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

/**
 * Splitter page object (Wave 13 / ADR-0013).
 *
 * DOM facts (from `<Splitter>`): the resizable layout is a CSS grid
 * (`[data-splitter="grid"]`) whose dividers are `role="separator"` elements
 * with `aria-label="Resize panels"` and `aria-orientation` reflecting the
 * split axis. The grid track sizes live in the inline `style` attribute
 * (`grid-template-columns` / `grid-template-rows`) — the single sanctioned
 * inline style. This object reaches the OUTERMOST splitter (Tasks | right
 * side) and drags its handle a known pixel delta, then lets the spec assert
 * the track ratios moved AND the page never scrolled.
 *
 * No `data-testid`: the separator role + aria-label are part of the shipped
 * a11y surface, exactly like the other page objects.
 */
export class SplitterPage {
  readonly page: Page;
  readonly app: AppPage;

  constructor(app: AppPage) {
    this.app = app;
    this.page = app.page;
  }

  /** Every Splitter grid container on the page (outer + nested). */
  private get grids(): Locator {
    return this.page.locator('[data-splitter="grid"]');
  }

  /** The outermost Splitter grid (Tasks | right side). */
  get outerGrid(): Locator {
    return this.grids.first();
  }

  /** The outermost vertical handle (between Tasks and the right side). */
  get outerHandle(): Locator {
    return this.outerGrid.locator(
      ':scope > [role="separator"][aria-orientation="vertical"]',
    );
  }

  /** The inline `grid-template-columns` string of the outer grid. */
  async outerColumnsTemplate(): Promise<string> {
    // `getAttribute("style")` keeps this DOM-lib-free (the e2e tsconfig only
    // loads @playwright/test + node types). The inline style holds exactly the
    // ADR-0013 grid template — `grid-template-columns: minmax(0, …fr) 16px …`.
    return (await this.outerGrid.getAttribute("style")) ?? "";
  }

  /** The fr numbers parsed out of the outer grid's column template. */
  async outerColumnFractions(): Promise<number[]> {
    const tpl = await this.outerColumnsTemplate();
    return Array.from(
      tpl.matchAll(/minmax\(0(?:px)?,\s*([\d.]+)fr\)/g),
    ).map((m) => Number(m[1]));
  }

  /**
   * Drag the outer (Tasks|right) handle by `dx` pixels horizontally using a
   * real mouse press → move → release (no synthetic events, no sleeps —
   * Playwright auto-waits the handle into the viewport first).
   */
  async dragOuterHandleBy(dx: number): Promise<void> {
    const handle = this.outerHandle;
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error("outer splitter handle has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    // Two-step move so the drag is registered as motion, not a jump.
    await this.page.mouse.move(cx + dx / 2, cy, { steps: 4 });
    await this.page.mouse.move(cx + dx, cy, { steps: 4 });
    await this.page.mouse.up();
  }

  /** Double-click the outer handle (resets the Tasks|right pair to average). */
  async resetOuterHandle(): Promise<void> {
    await this.outerHandle.dblclick();
  }

  /**
   * True when neither the document nor the body can scroll — i.e. the
   * Splitter layout filled the viewport WITHOUT overflowing it (ADR-0013
   * rule 1). Compares scroll vs. client size on both elements.
   */
  async pageHasNoOverflow(): Promise<boolean> {
    // Read scroll vs. client size off the <html> and <body> elements via
    // locator.evaluate (Playwright types the element — keeps this DOM-lib-free
    // for the e2e tsconfig; no bare `document` global). A +1 tolerance
    // absorbs sub-pixel rounding. Both axes, both elements must be flush.
    const measure = async (selector: string): Promise<boolean> => {
      const m = await this.page.locator(selector).evaluate((el) => ({
        sh: el.scrollHeight,
        ch: el.clientHeight,
        sw: el.scrollWidth,
        cw: el.clientWidth,
      }));
      return m.sh <= m.ch + 1 && m.sw <= m.cw + 1;
    };
    return (await measure("html")) && (await measure("body"));
  }

  /**
   * Returns the SMS feed region's `{ scrollHeight, clientHeight }` so a spec
   * can assert the feed is internally scrollable (content taller than its
   * box) while the page itself does not scroll.
   */
  async smsFeedScrollMetrics(): Promise<{
    scrollHeight: number;
    clientHeight: number;
  }> {
    // The scrolling element is the Panel body — the `overflow-y-auto` div that
    // CONTAINS the `aria-label="SMS messages"` feed (Panel.tsx renders the
    // body as `relative min-h-0 flex-1 overflow-y-auto`). Target it directly
    // via a structural selector instead of walking ancestors with
    // getComputedStyle (keeps this DOM-lib-free for the e2e tsconfig).
    const body = this.page
      .locator('div.overflow-y-auto')
      .filter({ has: this.app.smsRegion })
      .last();
    return body.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
  }
}
