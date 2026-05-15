/**
 * Pure Fibonacci generator (ADR-0004).
 *
 * 1-indexed: F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5, F(6)=8, ...
 * These values are the **gaps** (in simulated minutes) between consecutive SMS
 * sends, so sends land at cumulative minutes 1, 2, 4, 7, 12, 20, ...
 *
 * The core is BigInt because JS `number` loses Fibonacci exactness past ~F(78);
 * the "~100 known values" unit test asserts exactness against that. The runtime
 * uses {@link fibonacciMinutes} (a Number facade) and never reaches large
 * indices — a reset window is at most 100 simulated minutes.
 */

/** F(79) is the first value above Number.MAX_SAFE_INTEGER. */
export const MAX_SAFE_INDEX = 78;

/** Exact F(index), 1-indexed. Throws RangeError for non-integers or index < 1. */
export function fibonacciBig(index: number): bigint {
  if (!Number.isInteger(index) || index < 1) {
    throw new RangeError(`Fibonacci index must be an integer >= 1, got ${index}`);
  }
  let prev = 0n;
  let curr = 1n; // F(1)
  for (let i = 1; i < index; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return curr;
}

/** Lazy infinite sequence of Fibonacci gap values: 1n, 1n, 2n, 3n, 5n, 8n, ... */
export function* fibonacciIntervals(): Generator<bigint, never, unknown> {
  let prev = 0n;
  let curr = 1n;
  for (;;) {
    yield curr;
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
}

/**
 * Runtime gap accessor in simulated minutes. Exact within the safe integer
 * range; throws if asked for an index whose value would lose precision (the
 * scheduler must never request one — guarded as a defensive invariant).
 */
export function fibonacciMinutes(index: number): number {
  const value = fibonacciBig(index);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      `Fibonacci F(${index}) exceeds the safe integer range; the runtime cadence should never reach this index`,
    );
  }
  return Number(value);
}
