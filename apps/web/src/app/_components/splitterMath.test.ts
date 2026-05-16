import { describe, it, expect } from "vitest";
import {
  pxPerFr,
  deltaToFr,
  clampPairDelta,
  resetPairToAverage,
} from "./splitterMath";

/**
 * Wave 13.1 — pure resize math (ADR-0013). Deterministic, DOM-free unit
 * coverage of the three behaviours the Splitter relies on: the px↔fr scale,
 * the clamped delta application (neither side may drop below `minPx`), and the
 * double-click average reset. The component test (jsdom) exercises the same
 * functions through real DOM events; these prove the arithmetic in isolation.
 */
describe("pxPerFr", () => {
  it("is containerPx / sumFr (the px width of one fr unit)", () => {
    expect(pxPerFr(800, 2)).toBe(400);
    expect(pxPerFr(900, 3)).toBe(300);
  });

  it("returns 0 for a non-positive sumFr (degenerate; caller no-ops)", () => {
    expect(pxPerFr(800, 0)).toBe(0);
    expect(pxPerFr(800, -1)).toBe(0);
  });
});

describe("deltaToFr", () => {
  it("converts a pixel delta into fr units via the container scale", () => {
    // 800px container, sum 2fr → 400px per fr. 200px drag = 0.5 fr.
    expect(deltaToFr(200, 2, 800)).toBe(0.5);
    expect(deltaToFr(-100, 2, 800)).toBe(-0.25);
  });

  it("is 0 when the container has no measurable size", () => {
    expect(deltaToFr(200, 2, 0)).toBe(0);
  });
});

describe("clampPairDelta", () => {
  // Pair starts at [1fr, 1fr]; container 800px, sum 2fr → 400px each, 400px/fr.
  const base = {
    startA: 1,
    startB: 1,
    sumFr: 2,
    containerPx: 800,
    minPx: 100,
  };

  it("applies +Δ to A and −Δ to B (sum is conserved)", () => {
    const [a, b] = clampPairDelta({ ...base, deltaFr: 0.25 });
    expect(a).toBeCloseTo(1.25, 10);
    expect(b).toBeCloseTo(0.75, 10);
    expect(a + b).toBeCloseTo(2, 10);
  });

  it("applies a negative delta symmetrically", () => {
    const [a, b] = clampPairDelta({ ...base, deltaFr: -0.5 });
    expect(a).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(1.5, 10);
    expect(a + b).toBeCloseTo(2, 10);
  });

  it("clamps so B never drops below minPx (large positive delta)", () => {
    // minPx 100 → 0.25 fr floor. A can grow to at most 1.75fr (B = 0.25fr).
    const [a, b] = clampPairDelta({ ...base, deltaFr: 5 });
    expect(a).toBeCloseTo(1.75, 10);
    expect(b).toBeCloseTo(0.25, 10);
    expect(b * pxPerFr(base.containerPx, base.sumFr)).toBeGreaterThanOrEqual(
      base.minPx - 1e-6,
    );
  });

  it("clamps so A never drops below minPx (large negative delta)", () => {
    const [a, b] = clampPairDelta({ ...base, deltaFr: -5 });
    expect(a).toBeCloseTo(0.25, 10);
    expect(b).toBeCloseTo(1.75, 10);
    expect(a * pxPerFr(base.containerPx, base.sumFr)).toBeGreaterThanOrEqual(
      base.minPx - 1e-6,
    );
  });

  it("never lets the moved-away side cross the floor even at the exact edge", () => {
    // Exactly at the boundary: delta that puts B at precisely minPx.
    const [, b] = clampPairDelta({ ...base, deltaFr: 0.75 });
    expect(b).toBeCloseTo(0.25, 10); // 0.25fr * 400 = 100px = minPx
  });

  it("no-ops when the pair cannot satisfy two minPx (container too small)", () => {
    // 150px container, 2fr → 75px/fr. minPx 100 needs 200px total > 150 → the
    // clamp has no valid solution; keep the start sizes rather than corrupt.
    const [a, b] = clampPairDelta({
      startA: 1,
      startB: 1,
      sumFr: 2,
      containerPx: 150,
      minPx: 100,
      deltaFr: 0.3,
    });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("is a no-op for a zero delta", () => {
    const [a, b] = clampPairDelta({ ...base, deltaFr: 0 });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

describe("resetPairToAverage", () => {
  it("returns both sides at their mean (double-click reset)", () => {
    expect(resetPairToAverage(3, 1)).toEqual([2, 2]);
    expect(resetPairToAverage(1, 1)).toEqual([1, 1]);
  });

  it("handles asymmetric fr pairs", () => {
    const [a, b] = resetPairToAverage(2.5, 0.5);
    expect(a).toBeCloseTo(1.5, 10);
    expect(b).toBeCloseTo(1.5, 10);
  });
});
