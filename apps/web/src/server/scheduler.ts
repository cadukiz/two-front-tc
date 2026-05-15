/**
 * Wave 3 — the scheduler. Server-authoritative cadence engine (ADR-0004,
 * ADR-0005). One **tick = one simulated minute**; `start()` wires a single
 * `setInterval(tick, config.tickMs)`. Tests drive `tick()` directly N times
 * against a `createStore(injectedConfig)` — no real timers in unit tests.
 *
 * Types come from `@twofront/domain`; the store is the only mutable state.
 */
import { fibonacciMinutes } from "@twofront/domain";
import { getStore, type Store } from "./store";

export interface Scheduler {
  /** Advance exactly one simulated minute and perform that minute's work. */
  tick(): void;
  /** Wire the recurring `setInterval(tick, config.tickMs)` once (single-flight). */
  start(): void;
  /** Clear the interval (if any). */
  stop(): void;
  /** True iff an interval is currently wired. */
  readonly started: boolean;
}

export function createScheduler(store: Store): Scheduler {
  // State initialised at construction (ADR-0004 / ADR-0005).
  let minuteCount = 0;
  let emailMinutesElapsed = 0;
  let fibMinutesElapsed = 0;
  let fibIndex = 1;
  let nextSmsAtMinute = fibonacciMinutes(1); // = 1

  let intervalId: ReturnType<typeof setInterval> | undefined;

  /**
   * One simulated minute of work. Deterministic ordering — do not reorder:
   *
   *  1. Advance all minute counters.
   *  2. Steps 3–6 run inside try/catch: on error log + return so the
   *     `setInterval` stays alive (a tick must never throw).
   *  3. Fibonacci reset (ADR-0005): if the fib window elapsed, bump fibCycle,
   *     restart the sequence (index 1) and schedule the next send one
   *     simulated minute later — NO SMS is sent on the reset minute itself.
   *  4. Email reset (ADR-0005): if the email window elapsed, bump emailCycle.
   *     Cadence stays every minute; the summary created in step 6 this same
   *     minute therefore carries the new cycle.
   *  5. SMS (Fibonacci gaps, ADR-0004): if this minute is the scheduled send
   *     minute, append the SMS with the current fibIndex/F(fibIndex), then
   *     advance the index and add the next gap. Sends land at cumulative
   *     minutes 1,2,4,7,12,20…
   *  6. Summary email every minute (ADR-0004): always fires, even with 0
   *     pending tasks.
   */
  function tick(): void {
    minuteCount += 1;
    emailMinutesElapsed += 1;
    fibMinutesElapsed += 1;

    try {
      // 3. Fibonacci reset.
      if (fibMinutesElapsed >= store.config.fibonacciResetMinutes) {
        store.bumpFibCycle();
        fibIndex = 1;
        fibMinutesElapsed = 0;
        nextSmsAtMinute = minuteCount + fibonacciMinutes(1);
      }

      // 4. Email reset (cadence unchanged; only the cycle counter advances).
      if (emailMinutesElapsed >= store.config.emailResetMinutes) {
        store.bumpEmailCycle();
        emailMinutesElapsed = 0;
      }

      // 5. SMS on Fibonacci gap minutes.
      if (minuteCount === nextSmsAtMinute) {
        store.appendSms({ fibIndex, fibMinute: fibonacciMinutes(fibIndex) });
        fibIndex += 1;
        nextSmsAtMinute += fibonacciMinutes(fibIndex);
      }

      // 6. Summary email every minute.
      store.appendSummaryEmail();
    } catch (err) {
      // Keep the interval alive — a tick must never throw out.
      console.error("[scheduler] tick failed:", err);
      return;
    }
  }

  return {
    tick,
    start(): void {
      if (intervalId !== undefined) return; // single-flight
      intervalId = setInterval(tick, store.config.tickMs);
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
 * `getStore()` singleton and `start()`s it. Single-flight on `globalThis` so
 * Next hot-reload and multiple concurrent SSE connects never double-start the
 * cadence (ADR-0004 D3 — SSE calls this on first connect).
 */
export function ensureSchedulerStarted(): void {
  globalThis.__twofront_scheduler ??= createScheduler(getStore());
  globalThis.__twofront_scheduler.start();
}
