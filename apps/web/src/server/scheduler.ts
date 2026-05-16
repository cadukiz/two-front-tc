/**
 * Wave 3 / Wave 10 — the scheduler. Server-authoritative cadence engine
 * (ADR-0004, **superseded in part by ADR-0009**). One **tick = one minute**;
 * `start()` wires a single `setInterval(tick, store.tickMs)` (internal/test-only
 * ms-per-minute). Tests drive `tick()` directly N times against a
 * `createStore(injectedConfig)` — no real timers in unit tests.
 *
 * Runtime config (ADR-0009) is **mutable and read fresh every tick** from
 * `store.getRuntimeConfig()`. It carries exactly two user-facing ints: the
 * summary-email interval and the Fibonacci-reset window (days). The SMS
 * Fibonacci pace is **not configurable** — gaps are always the natural `F(k)`
 * minutes. `recomputeFromConfig()` is invoked by the store the instant the
 * config changes so a shrunk reset window is applied deterministically mid-run
 * (see the rule on each step below); the summary interval needs no recompute.
 *
 * Types come from `@twofront/domain`; the store is the only mutable state.
 */
import { fibonacciMinutes, MINUTES_PER_DAY } from "@twofront/domain";
import { getStore, type Store } from "./store";

export interface Scheduler {
  /** Advance exactly one minute and perform that minute's work. */
  tick(): void;
  /**
   * Re-evaluate the Fibonacci-reset window against the **current** runtime
   * config (ADR-0009). Called by the store inside `setRuntimeConfig` BEFORE the
   * `config.updated` broadcast. Deterministic — see the rule in the body.
   * Idempotent: calling it without a config change is a no-op.
   */
  recomputeFromConfig(): void;
  /**
   * Emit the one-time startup pair (one summary email + one SMS) immediately,
   * single-flight per scheduler lifetime (ADR-0004 D3). Idempotent — a second
   * call (reconnect / hot-reload) is a no-op. `start()` calls this; exposed for
   * deterministic unit assertions without wiring a real interval.
   */
  emitStartup(): void;
  /**
   * Wire the recurring `setInterval(tick, store.tickMs)` once (single-flight)
   * AND emit the one-time startup pair (`emitStartup()`) on the first start.
   */
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
  // The anchor for the *current* pending gap — re-anchored to the firing
  // minute on each send and to `minuteCount` on a Fibonacci reset.
  let smsAnchorMinute = 0;
  let nextSmsAtMinute = computeNextSms(smsAnchorMinute, fibIndex);

  let intervalId: ReturnType<typeof setInterval> | undefined;
  // Single-flight startup-emit guard (ADR-0004 D3). The startup summary + SMS
  // fire exactly ONCE per scheduler lifetime — this flag, together with the
  // `globalThis` singleton in `ensureSchedulerStarted`, guarantees that a
  // reconnect (a second SSE connect) or a Next dev hot-reload (which re-evals
  // the module but reuses the global scheduler) can never double-emit them.
  let startupEmitted = false;

  /** Gap-end minute for the pending send: anchor + F(fibIndex) minutes. */
  function computeNextSms(anchorMinute: number, idx: number): number {
    return anchorMinute + fibonacciMinutes(idx);
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
   *     send minute, append the SMS (gap minutes = F(fibIndex)), then advance
   *     the index and re-anchor the next gap to *this* minute.
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
          fibMinute: fibonacciMinutes(fibIndex),
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

  /**
   * Mid-run config change recompute (ADR-0009). The runtime config carries two
   * user-facing ints; only one has any mid-run effect to re-derive:
   *
   *  - **Summary interval**: nothing to recompute — step 5 evaluates
   *    `minuteCount % interval` against the live config each tick.
   *  - **Fibonacci reset days**: re-evaluate the window immediately. If
   *    `fibMinutesElapsed` has already reached the *new* (smaller) window, the
   *    reset fires now (cycle++, sequence restart, re-anchor) exactly as a tick
   *    would; otherwise the longer window simply defers it.
   *
   * (The SMS Fibonacci pace is not configurable, so the pending gap never has
   * to be re-anchored for a config change.)
   */
  function recomputeFromConfig(): void {
    // A shrunk reset window may already be due — apply it deterministically.
    if (fibMinutesElapsed >= fibResetWindowMinutes()) {
      resetFibonacci();
    }
  }

  /**
   * One-time startup emit (ADR-0004 D3 — instant content on first SSE connect
   * instead of waiting up to a full minute for the first tick).
   *
   * STARTUP SCHEDULE RULE (coherent + deterministic — do not change lightly):
   *  - The startup SMS *is* the FIRST Fibonacci send: `fibIndex 1`,
   *    `fibMinute = fibonacciMinutes(1) = 1`, `fibCycle 0`, conceptually at
   *    "minute 0" (`minuteCount` is still 0 here — `start()` calls this before
   *    the first `tick()`).
   *  - We then advance the SMS state EXACTLY as the tick's send-block does
   *    after a send: re-anchor `smsAnchorMinute` to the current minute (0),
   *    bump `fibIndex` to 2, and recompute `nextSmsAtMinute = 0 + F(2) = 1`.
   *    So the recurring sequence *continues* from the startup send — the next
   *    SMS is the SECOND Fibonacci gap (idx 2) at minute 1, NOT a duplicate
   *    idx-1 send at the old minute-1 mark. Full send schedule (minute:idx):
   *    0:1, 1:2, 3:3, 6:4, 11:5, 19:6, … (vs. the no-startup 1:1, 2:2, 4:3, …).
   *  - The startup summary email reflects the CURRENT pending tasks (empty `[]`
   *    at boot ⇒ the existing "No pending tasks at this time." path still fires
   *    — ADR-0004). The recurring summary then continues on its normal
   *    `emailSummaryIntervalMinutes` cadence, evaluated per tick against
   *    `minuteCount` (unaffected — `minuteCount` is untouched here).
   *
   * Single-flight via `startupEmitted`: a reconnect or hot-reload that calls
   * `start()`/`emitStartup()` again is a strict no-op (exactly one of each).
   */
  function emitStartup(): void {
    if (startupEmitted) return; // single-flight — no double-emit ever
    startupEmitted = true;
    try {
      // Startup summary (current pending; empty ⇒ the no-pending path fires).
      store.appendSummaryEmail();
      // Startup SMS = the first Fibonacci send (idx 1, F(1)=1, cycle 0).
      store.appendSms({
        fibIndex,
        fibMinute: fibonacciMinutes(fibIndex),
      });
      // Advance exactly as a tick send would: re-anchor to the current minute
      // (0), bump the index, recompute the next gap → idx 2 at minute 1. This
      // is what makes the recurring sequence a coherent continuation (no dupe).
      smsAnchorMinute = minuteCount;
      fibIndex += 1;
      nextSmsAtMinute = computeNextSms(smsAnchorMinute, fibIndex);
    } catch (err) {
      // Never let the startup emit throw out of start()/the SSE connect path.
      console.error("[scheduler] startup emit failed:", err);
    }
  }

  return {
    tick,
    recomputeFromConfig,
    emitStartup,
    start(): void {
      // Startup pair fires once, before the first recurring tick, so the user
      // gets instant content. Single-flight inside `emitStartup`.
      emitStartup();
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
