import { test, expect } from "@playwright/test";
import { AppPage } from "../pages/AppPage";
import { TasksPage } from "../pages/TasksPage";
import { SplitterPage } from "../pages/SplitterPage";

/**
 * Wave 13 (ADR-0013) — resizable Splitter, end-to-end.
 *
 * Proves the three things the brief requires of the Splitter system:
 *   1. Drag a divider a KNOWN pixel delta → the dragged pair's grid track
 *      ratios move (Tasks grows, the right side shrinks) and the Tasks panel
 *      is visibly wider — i.e. the layout is genuinely resizable.
 *   2. The whole layout fills the viewport and NEVER overflows: neither the
 *      document nor the body scrolls, before AND after the drag (ADR-0013
 *      rule 1 — the app shell is `h-screen overflow-hidden`).
 *   3. A feed still scrolls INTERNALLY: with enough content the SMS Panel
 *      body becomes scrollable (scrollHeight > clientHeight) while the page
 *      itself stays non-scrolling — containment, not page overflow.
 *   4. Double-click the divider resets the pair to equal tracks.
 *
 * Serial/deterministic + web-first assertions, NO arbitrary sleeps (drag is a
 * real mouse press/move/release; content growth is awaited via `expect.poll`
 * against the compressed-time cadence already configured in playwright.config).
 * The desktop Splitter renders at the default 1280×720 Chromium viewport
 * (≥ lg breakpoint).
 */
test("Wave 13: drag a Splitter handle — panel resizes, page never overflows, feed scrolls internally", async ({
  page,
}) => {
  const app = new AppPage(page);
  const tasks = new TasksPage(app);
  const splitter = new SplitterPage(app);

  await app.goto();

  // The desktop Splitter tree is present (outer Tasks|right grid + handle).
  await expect(splitter.outerGrid).toBeVisible();
  await expect(splitter.outerHandle).toBeVisible();

  // (2) No overflow at load — the layout exactly fills the viewport.
  expect(await splitter.pageHasNoOverflow()).toBe(true);

  // (1) Snapshot the outer track ratio, drag the divider +180px to the right
  // (Tasks should grow, the right side shrink), and assert the ratios moved.
  const before = await splitter.outerColumnFractions();
  expect(before.length).toBeGreaterThanOrEqual(2);
  const tasksBox0 = await app.tasksRegion.boundingBox();

  await splitter.dragOuterHandleBy(180);

  const after = await splitter.outerColumnFractions();
  expect(after.length).toBe(before.length);
  // Tasks (track 0) grew; the right side (track 1) shrank; sum conserved.
  expect(after[0]!).toBeGreaterThan(before[0]!);
  expect(after[1]!).toBeLessThan(before[1]!);
  expect(after[0]! + after[1]!).toBeCloseTo(before[0]! + before[1]!, 4);

  // …and the Tasks panel is actually wider on screen now.
  const tasksBox1 = await app.tasksRegion.boundingBox();
  expect(tasksBox0).not.toBeNull();
  expect(tasksBox1).not.toBeNull();
  expect(tasksBox1!.width).toBeGreaterThan(tasksBox0!.width + 50);

  // (2) Still no page overflow after resizing.
  expect(await splitter.pageHasNoOverflow()).toBe(true);

  // (3) Generate feed content so the SMS Panel body must scroll internally.
  // Add several tasks → the recurring Fibonacci SMS reminders accumulate
  // (server-authoritative, via SSE) under the compressed cadence. Wait for
  // enough bubbles that the SMS feed overflows its (now narrower) panel.
  for (let i = 0; i < 4; i++) {
    await tasks.addTask(`Splitter overflow task ${i}`);
  }
  await expect
    .poll(async () => splitter.app.smsRegion.locator("> *").count(), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(4);
  await expect
    .poll(
      async () => {
        const m = await splitter.smsFeedScrollMetrics();
        return m.scrollHeight - m.clientHeight;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  // The feed scrolls inside its Panel — but the PAGE still does not scroll.
  expect(await splitter.pageHasNoOverflow()).toBe(true);

  // (4) Double-click the divider → the Tasks|right pair resets to equal.
  await splitter.resetOuterHandle();
  const reset = await splitter.outerColumnFractions();
  expect(reset[0]!).toBeCloseTo(reset[1]!, 4);
  expect(await splitter.pageHasNoOverflow()).toBe(true);
});
