import { describe, it, expect } from "vitest";
import {
  fibonacciBig,
  fibonacciIntervals,
  fibonacciMinutes,
  MAX_SAFE_INDEX,
} from "./fibonacci";

/**
 * The "~100 known values" check (user requirement). The generator core is
 * BigInt, so these comparisons are exact past F(78) where JS `number` would
 * silently lose precision.
 */

// First 30 well-known Fibonacci numbers, 1-indexed (F(1)=F(2)=1).
const KNOWN_FIRST_30: readonly bigint[] = [
  1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n, 55n,
  89n, 144n, 233n, 377n, 610n, 987n, 1597n, 2584n, 4181n, 6765n,
  10946n, 17711n, 28657n, 46368n, 75025n, 121393n, 196418n, 317811n, 514229n, 832040n,
];

// Independently-known anchor values (textbook constants).
const ANCHORS: ReadonlyArray<readonly [number, bigint]> = [
  [50, 12586269025n],
  [75, 2111485077978050n],
  [100, 354224848179261915075n],
];

describe("fibonacci generator", () => {
  it("matches the first 30 known values (1-indexed, F(1)=F(2)=1)", () => {
    KNOWN_FIRST_30.forEach((expected, i) => {
      expect(fibonacciBig(i + 1)).toBe(expected);
    });
  });

  it("matches known anchor values through F(100)", () => {
    for (const [index, value] of ANCHORS) {
      expect(fibonacciBig(index)).toBe(value);
    }
  });

  it("satisfies F(n) = F(n-1) + F(n-2) across the first 100", () => {
    for (let n = 3; n <= 100; n++) {
      expect(fibonacciBig(n)).toBe(fibonacciBig(n - 1) + fibonacciBig(n - 2));
    }
  });

  it("lazy generator agrees with fibonacciBig for the first 100", () => {
    const gen = fibonacciIntervals();
    for (let n = 1; n <= 100; n++) {
      expect(gen.next().value).toBe(fibonacciBig(n));
    }
  });

  it("rejects index < 1 and non-integers", () => {
    expect(() => fibonacciBig(0)).toThrow(RangeError);
    expect(() => fibonacciBig(-3)).toThrow(RangeError);
    expect(() => fibonacciBig(2.5)).toThrow(RangeError);
  });

  it("number facade is exact within the safe range and guards beyond it", () => {
    expect(fibonacciMinutes(1)).toBe(1);
    expect(fibonacciMinutes(10)).toBe(55);
    expect(fibonacciMinutes(MAX_SAFE_INDEX)).toBe(Number(fibonacciBig(MAX_SAFE_INDEX)));
    expect(() => fibonacciMinutes(MAX_SAFE_INDEX + 1)).toThrow(RangeError);
  });
});
