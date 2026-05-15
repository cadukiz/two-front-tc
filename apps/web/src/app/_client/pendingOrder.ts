/**
 * Pure helpers for the Wave 9.3 client-only drag prioritization (ADR-0008).
 *
 * NON-AUTHORITATIVE & NON-PERSISTENT: the server's `seq` order is the truth.
 * This is a cosmetic local overlay on the *pending* list only — it never
 * touches the server, never persists (a refresh restores `seq` order), and
 * leaves the completed list / emails / SMS strictly `seq`-driven and
 * untouched. These functions are pure so the overlay is unit-testable with
 * zero DOM. Domain `Task` type from `@twofront/domain` (no parallel def).
 */
import type { Task } from "@twofront/domain";

/** A user-chosen local ordering of pending task ids (most-priority first). */
export type PendingOrder = readonly string[];

export type DropEdge = "before" | "after";

/**
 * Overlay the local `order` on top of the SSE-driven `pending` list.
 *
 * `pending` arrives newest-first by `seq` (server truth). Pending ids NOT in
 * the local order are "untouched" and stay at the top in that incoming
 * `seq` order (newest-first, as before). Ids that the user has dragged
 * (present in `order`) render below, in the exact local order. Order entries
 * whose task is gone (completed/removed) are skipped — they "drop out".
 */
export function applyPendingOrder(
  pending: readonly Task[],
  order: PendingOrder,
): Task[] {
  const byId = new Map(pending.map((t) => [t.id, t]));
  const inOrder = new Set(order);

  const untouched = pending.filter((t) => !inOrder.has(t.id));
  const ordered: Task[] = [];
  for (const id of order) {
    const t = byId.get(id);
    if (t) ordered.push(t);
  }
  return [...untouched, ...ordered];
}

/**
 * Compute the next local order after the user drags `fromId` to the
 * `edge` side of `toId`. The result is the *full currently-displayed*
 * sequence of pending ids (so the move sticks); ids not yet in the order
 * become ordered by virtue of being dragged-near. No-ops on bad input.
 */
export function reorderPending(
  order: PendingOrder,
  pending: readonly Task[],
  fromId: string,
  toId: string,
  edge: DropEdge,
): PendingOrder {
  if (fromId === toId) return order;

  // Current visible sequence = the overlay applied to the live pending list.
  const visible = applyPendingOrder(pending, order).map((t) => t.id);
  const fromIdx = visible.indexOf(fromId);
  const toIdx = visible.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return order;

  const next = visible.slice();
  next.splice(fromIdx, 1);
  // Re-find the target after removal (indices shift if from < to).
  let insertAt = next.indexOf(toId);
  if (insertAt === -1) insertAt = next.length;
  if (edge === "after") insertAt += 1;
  next.splice(insertAt, 0, fromId);
  return next;
}

/**
 * Drop ids whose task is no longer pending (completed/removed) so the stored
 * order can't grow unbounded and "resets sensibly when a task leaves".
 */
export function prunePendingOrder(
  order: PendingOrder,
  pending: readonly Task[],
): PendingOrder {
  const alive = new Set(pending.map((t) => t.id));
  const pruned = order.filter((id) => alive.has(id));
  return pruned.length === order.length ? order : pruned;
}
