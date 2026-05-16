/**
 * Wave 13.1 — pure resize math for `<Splitter>` (ADR-0013).
 *
 * The Splitter stores pane sizes as fractional (`fr`) units in React state and
 * renders them through a runtime `grid-template-columns/rows` (the single
 * sanctioned inline-style exception to ADR-0007). All the arithmetic that maps
 * a pointer drag in pixels onto those fr units lives here as deterministic,
 * DOM-free functions so it can be unit-tested in isolation and reasoned about
 * independently of React/jsdom. The component is a thin event shell over these.
 */

/** Pixels occupied by one `fr` unit, given the container size and the fr sum. */
export function pxPerFr(containerPx: number, sumFr: number): number {
  if (sumFr <= 0 || containerPx <= 0) return 0;
  return containerPx / sumFr;
}

/**
 * Convert a pixel delta (how far the handle moved along the split axis) into
 * the equivalent number of `fr` units for this container. Returns 0 when the
 * container has no measurable size (the caller then no-ops the drag).
 */
export function deltaToFr(
  deltaPx: number,
  sumFr: number,
  containerPx: number,
): number {
  const scale = pxPerFr(containerPx, sumFr);
  if (scale === 0) return 0;
  return deltaPx / scale;
}

export interface ClampPairArgs {
  /** The dragged pair's start sizes (fr), snapshotted at mousedown. */
  startA: number;
  startB: number;
  /** Drag delta already converted to fr (see `deltaToFr`). */
  deltaFr: number;
  /** Sum of ALL fr tracks (the grid's total fr), for the px scale. */
  sumFr: number;
  /** Container size in px along the split axis. */
  containerPx: number;
  /** Minimum px size neither side of the pair may drop below. */
  minPx: number;
}

/**
 * Apply `+deltaFr` to A and `−deltaFr` to B (the pair's combined size is
 * conserved — only the boundary between them moves), then clamp so that
 * neither side falls below `minPx`. If the container is too small to satisfy
 * `minPx` on *both* sides at once the drag is a no-op (start sizes returned) —
 * better an unchanged layout than one corrupted below its own minimums.
 */
export function clampPairDelta(args: ClampPairArgs): [number, number] {
  const { startA, startB, deltaFr, sumFr, containerPx, minPx } = args;

  const scale = pxPerFr(containerPx, sumFr);
  if (scale === 0) return [startA, startB];

  // The pair's combined fr budget is fixed; only the divider moves.
  const pairFr = startA + startB;
  const minFr = minPx / scale;

  // Degenerate: can't fit two minimums in the pair's budget — leave as-is.
  if (minFr * 2 > pairFr) return [startA, startB];

  let a = startA + deltaFr;
  // Clamp A into [minFr, pairFr - minFr]; B is the conserved remainder.
  if (a < minFr) a = minFr;
  if (a > pairFr - minFr) a = pairFr - minFr;
  const b = pairFr - a;
  return [a, b];
}

/**
 * Double-click reset: split the pair's combined budget evenly (both sides at
 * their mean). Pure; no clamping needed — the mean of two positive sizes is
 * always within the budget and (by construction here) ≥ each original min in
 * practice, but the component still re-clamps on the next drag.
 */
export function resetPairToAverage(a: number, b: number): [number, number] {
  const avg = (a + b) / 2;
  return [avg, avg];
}
