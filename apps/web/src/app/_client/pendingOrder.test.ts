import { describe, it, expect } from "vitest";
import type { Task } from "@twofront/domain";
import {
  applyPendingOrder,
  reorderPending,
  prunePendingOrder,
} from "./pendingOrder";

/**
 * Wave 9.3 — pure overlay helpers for the client-only, non-persistent drag
 * prioritization (ADR-0008). The server `seq` order is the truth; these only
 * compute a cosmetic overlay on the pending list.
 */
const task = (id: string, seq: number): Task => ({
  id,
  seq,
  title: `task ${id}`,
  status: "pending",
  createdAt: 0,
  completedAt: null,
});

// Reducer hands `pending` newest-first by seq.
const pending = [task("c", 3), task("b", 2), task("a", 1)];

describe("applyPendingOrder", () => {
  it("returns the live seq order when there is no local order", () => {
    expect(applyPendingOrder(pending, []).map((t) => t.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("places ordered ids after the untouched (newest-by-seq) ones", () => {
    // User has dragged 'a' into the local order; b/c are still untouched.
    expect(applyPendingOrder(pending, ["a"]).map((t) => t.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("renders a full local order exactly as chosen", () => {
    expect(
      applyPendingOrder(pending, ["a", "c", "b"]).map((t) => t.id),
    ).toEqual(["a", "c", "b"]);
  });

  it("skips order entries whose task is gone (drop-out)", () => {
    // 'b' completed/removed → only c & a remain.
    const remaining = [task("c", 3), task("a", 1)];
    expect(
      applyPendingOrder(remaining, ["a", "b", "c"]).map((t) => t.id),
    ).toEqual(["a", "c"]);
  });

  it("a brand-new pending task appears at the top until dragged", () => {
    const withNew = [task("d", 9), ...pending];
    expect(
      applyPendingOrder(withNew, ["a", "c", "b"]).map((t) => t.id),
    ).toEqual(["d", "a", "c", "b"]);
  });
});

describe("reorderPending", () => {
  it("moves a task before another in the displayed sequence", () => {
    const next = reorderPending([], pending, "a", "c", "before");
    expect(applyPendingOrder(pending, next).map((t) => t.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("moves a task after another in the displayed sequence", () => {
    const next = reorderPending([], pending, "c", "a", "after");
    expect(applyPendingOrder(pending, next).map((t) => t.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("is a no-op when dragging onto itself", () => {
    const order = ["a", "b"];
    expect(reorderPending(order, pending, "a", "a", "before")).toBe(order);
  });

  it("is a no-op when an id is not present", () => {
    const order = ["a"];
    expect(reorderPending(order, pending, "zzz", "a", "before")).toBe(
      order,
    );
  });
});

describe("prunePendingOrder", () => {
  it("drops ids whose task is no longer pending", () => {
    expect(prunePendingOrder(["a", "b", "c"], [task("a", 1)])).toEqual([
      "a",
    ]);
  });

  it("returns the same reference when nothing changed (stable)", () => {
    const order = ["c", "b", "a"];
    expect(prunePendingOrder(order, pending)).toBe(order);
  });

  it("resets to empty when every ordered task has left", () => {
    expect(prunePendingOrder(["a", "b"], [])).toEqual([]);
  });
});
