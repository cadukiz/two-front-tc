/**
 * Wave 3 / Wave 10 — the scheduler. Server-authoritative cadence engine
 * (ADR-0004, **superseded in part by ADR-0009**). One **tick = one minute**;
 * `start()` wires a single `setInterval(tick, store.tickMs)` (internal/test-only
 * ms-per-minute). Tests drive `tick()` directly N times against a
 * `createStore(injectedConfig)` — no real timers in unit tests.
 *
 * Runtime config (ADR-0009) is **mutable and read fresh every tick** from
 * `store.getRuntimeConfig()`. `recomputeFromConfig()` is invoked by the store
 * the instant the config changes so the next summary / SMS / reset is
 * re-derived deterministically mid-run (see the rule on each step below).
 *
 * Types come from `@twofront/domain`; the store is the only mutable state.
 */
import { fibonacciMinutes, MINUTES_PER_DAY } from "@twofront/domain";
import { getStore, type Store } from "./store";

export interface Scheduler {
  /** Advance exactly one minute and perform that minute's work. */
  tick(): void;
  /**
   * Re-derive the next SMS/summary/reset against the **current** runtime
   * config (ADR-0009). Called by the store inside `setRuntimeConfig` BEFORE the
   * `config.updated` broadcast. Deterministic — see the per-concern rules in
   * the body. Idempotent: calling it without a config change is a no-op.
   */
  recomputeFromConfig(): void;
  /** Wire the recurring `setInterval(tick, store.tickMs)` once (single-flight). */
  start(): void;
  /** Clear the interval (if any). */
  stop(): void;
  /** True iff an interval is currently wired. */
  readonly started: boolean;
}

export function createScheduler(store: Store): Scheduler {
  // Minute counters (ADR-0004 / ADR-0009). `minuteCount` is the absolute clock.
  let minuteCount = 0;
  // Minutes elapsed in the current Fibonacci-reset window (resets to 0 on
  // reset). The window length is `fibonacciResetDays * 1440` minutes (ADR-0009).
  let fibMinutesElapsed = 0;
  let fibIndex = 1;
  // The minute the previous SMS fired (0 = none yet, i.e. the cycle anchor).
  // The anchor for the *current* pending gap — `recomputeFromConfig` re-derives
  // `nextSmsAtMinute` relative to this so a mid-run base change is deterministic.
  let smsAnchorMinute = 0;
  let nextSmsAtMinute = computeNextSms(smsAnchorMinute, fibIndex);

  let intervalId: ReturnType<typeof setInterval> | undefined;

  /** Gap-end minute for the pending send: anchor + F(fibIndex) × base. */
  function computeNextSms(anchorMinute: number, idx: number): number {
    const base = store.getRuntimeConfig().smsBaseIntervalMinutes;
    return anchorMinute + fibonacciMinutes(idx) * base;
  }

  /** Current Fibonacci-reset window length in minutes (≥1; ADR-0009: days×1440). */
  function fibResetWindowMinutes(): number {
    return store.getRuntimeConfig().fibonacciResetDays * MINUTES_PER_DAY;
  }

  /** Restart the Fibonacci sequence (cycle++, index 1) anchored at `minuteCount`. */
  function resetFibonacci(): void {
    store.bumpFibCycle();
    fibIndex = 1;
    fibMinutesElapsed = 0;
    smsAnchorMinute = minuteCount;
    nextSmsAtMinute = computeNextSms(smsAnchorMinute, fibIndex);
  }

  /**
   * One minute of work. Deterministic ordering — do not reorder:
   *
   *  1. Advance the minute counters.
   *  2. Steps 3–5 run inside try/catch: on error log + return so the
   *     `setInterval` stays alive (a tick must never throw).
   *  3. Fibonacci reset (ADR-0009): if `fibMinutesElapsed` reached the window
   *     (`fibonacciResetDays × 1440`), bump fibCycle, restart the sequence and
   *     re-anchor the next send — NO SMS is sent on the reset minute itself.
   *  4. SMS (Fibonacci gaps, ADR-0004/0009): if this minute is the scheduled
   *     send minute, append the SMS (gap minutes = F(fibIndex) × base), then
   *     advance the index and re-anchor the next gap to *this* minute.
   *  5. Summary email (ADR-0009): fires when
   *     `minuteCount % emailSummaryIntervalMinutes === 0` (default 1 ⇒ every
   *     minute), always — even with 0 pending tasks. This is a pure function
   *     of `minuteCount` and the live config, so it needs no recompute.
   */
  function tick(): void {
    minuteCount += 1;
    fibMinutesElapsed += 1;

    try {
      // 3. Fibonacci reset.
      if (fibMinutesElapsed >= fibResetWindowMinutes()) {
        resetFibonacci();
      }

      // 4. SMS on Fibonacci gap minutes.
      if (minuteCount === nextSmsAtMinute) {
        store.appendSms({
          fibIndex,
          fibMinute: computeSmsGap(fibIndex),
        });
        smsAnchorMinute = minuteCount;
        fibIndex += 1;
        nextSmsAtMinute = computeNextSms(smsAnchorMinute, fibIndex);
      }

      // 5. Summary email on its configurable cadence.
      if (
        minuteCount % store.getRuntimeConfig().emailSummaryIntervalMinutes ===
        0
      ) {
        store.appendSummaryEmail();
      }
    } catch (err) {
      // Keep the interval alive — a tick must never throw out.
      console.error("[scheduler] tick failed:", err);
      return;
    }
  }

  /** Gap minutes recorded on the SMS = F(fibIndex) × base (ADR-0009). */
  function computeSmsGap(idx: number): number {
    return (
      fibonacciMinutes(idx) * store.getRuntimeConfig().smsBaseIntervalMinutes
    );
  }

  /**
   * Mid-run config change recompute (ADR-0009). Deterministic rule:
   *
   *  - **SMS base**: the pending gap's index (`fibIndex`) and its anchor
   *    (`smsAnchorMinute` = the minute the previous SMS fired, or 0) are
   *    preserved; the next send minute is re-derived as
   *    `anchor + F(fibIndex) × newBase`. If that is already ≤ the current
   *    `minuteCount` (a base *decrease* moved the target into the past), it is
   *    clamped to `minuteCount + 1` so the very next tick fires it — never
   *    retroactively, never skipped.
   *  - **Summary interval**: nothing to recompute — step 5 evaluates
   *    `minuteCount % interval` against the live config each tick.
   *  - **Fibonacci reset days**: re-evaluate the window immediately. If
   *    `fibMinutesElapsed` has already reached the *new* (smaller) window, the
   *    reset fires now (cycle++, sequence restart, re-anchor) exactly as a tick
   *    would; otherwise the longer window simply defers it.
   */
  function recomputeFromConfig(): void {
    // Re-anchor the pending SMS to the new base (index/anchor unchanged).
    const rederived = computeNextSms(smsAnchorMinute, fibIndex);
    nextSmsAtMinute =
      rederived <= minuteCount ? minuteCount + 1 : rederived;

    // A shrunk reset window may already be due — apply it deterministically.
    if (fibMinutesElapsed >= fibResetWindowMinutes()) {
      resetFibonacci();
    }
  }

  return {
    tick,
    recomputeFromConfig,
    start(): void {
      if (intervalId !== undefined) return; // single-flight
      intervalId = setInterval(tick, store.tickMs);
    },
    stop(): void {
      if (intervalId === undefined) return;
      clearInterval(intervalId);
      intervalId = undefined;
    },
    get started(): boolean {
      return intervalId !== undefined;
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __twofront_scheduler: Scheduler | undefined;
}

/**
 * Idempotent. Lazily builds the `globalThis` singleton scheduler over the
 * `getStore()` singleton, wires its `recomputeFromConfig` into the store as the
 * config-change handler (ADR-0009), and `start()`s it. Single-flight on
 * `globalThis` so Next hot-reload and multiple concurrent SSE connects never
 * double-start the cadence (ADR-0004 D3 — SSE calls this on first connect).
 */
export function ensureSchedulerStarted(): void {
  if (globalThis.__twofront_scheduler === undefined) {
    const store = getStore();
    const scheduler = createScheduler(store);
    store.setConfigChangeHandler(() => scheduler.recomputeFromConfig());
    globalThis.__twofront_scheduler = scheduler;
  }
  globalThis.__twofront_scheduler.start();
}
