import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { Config } from "@twofront/domain";
import { createStore, type Store } from "./store";
import { createScheduler } from "./scheduler";

/**
 * Injected config literal — no `process.env`, no real timers. Reset windows are
 * set wide (100) by default so they never interfere with cadence/SMS tests; the
 * reset tests override them with their own `createStore`.
 */
const CONFIG: Config = {
  tickMs: 60,
  fibonacciResetMinutes: 100,
  emailResetMinutes: 100,
};

const summaryEmails = (store: Store) =>
  store.snapshot().emails.filter((e) => e.kind === "summary");

describe("createScheduler — summary email cadence (ADR-0004)", () => {
  it("creates one summary email every tick, even with 0 pending tasks", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    for (let i = 0; i < 10; i += 1) scheduler.tick();

    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(10);
    for (const s of summaries) {
      expect(s.pendingTitles).toEqual([]);
      expect(s.emailCycle).toBe(0);
    }
  });

  it("summary email reflects pending titles created before the tick", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    store.addTask("Alpha");
    scheduler.tick();
    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.pendingTitles).toEqual(["Alpha"]);
  });
});

describe("createScheduler — Fibonacci SMS cadence (ADR-0004)", () => {
  it("sends SMS only at cumulative minutes 1,2,4,7,12,20 with correct fibIndex/fibMinute", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    // Run enough minutes to cover the first six sends (cumulative max = 20).
    for (let i = 0; i < 25; i += 1) scheduler.tick();

    const sent = store.snapshot().sms.slice().sort((a, b) => a.seq - b.seq);
    expect(sent).toHaveLength(6);

    const expected = [
      { fibIndex: 1, fibMinute: 1 },
      { fibIndex: 2, fibMinute: 1 },
      { fibIndex: 3, fibMinute: 2 },
      { fibIndex: 4, fibMinute: 3 },
      { fibIndex: 5, fibMinute: 5 },
      { fibIndex: 6, fibMinute: 8 },
    ];
    sent.forEach((sms, i) => {
      expect(sms.fibIndex).toBe(expected[i]!.fibIndex);
      expect(sms.fibMinute).toBe(expected[i]!.fibMinute);
      expect(sms.fibCycle).toBe(0);
    });
  });

  it("does not send an SMS on minutes between the Fibonacci marks", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    // Minute 3 is between marks 2 and 4 → no send lands exactly there.
    scheduler.tick(); // m1 → send #1
    scheduler.tick(); // m2 → send #2
    expect(store.snapshot().sms).toHaveLength(2);
    scheduler.tick(); // m3 → no send
    expect(store.snapshot().sms).toHaveLength(2);
    scheduler.tick(); // m4 → send #3
    expect(store.snapshot().sms).toHaveLength(3);
  });
});

describe("createScheduler — Fibonacci reset (ADR-0005)", () => {
  it("restarts the sequence after fibonacciResetMinutes; no SMS on the reset minute", () => {
    const store = createStore({
      tickMs: 60,
      fibonacciResetMinutes: 7,
      emailResetMinutes: 100,
    });
    const scheduler = createScheduler(store);

    // Sends at cumulative minutes 1,2,4 (indices 1,2,3) before the reset at m7.
    for (let i = 0; i < 7; i += 1) scheduler.tick();

    const beforeReset = store.snapshot().sms.slice().sort((a, b) => a.seq - b.seq);
    expect(beforeReset).toHaveLength(3);
    expect(beforeReset.map((s) => s.fibIndex)).toEqual([1, 2, 3]);
    expect(beforeReset.every((s) => s.fibCycle === 0)).toBe(true);

    // The reset happened at minute 7; fibCycle bumped, no SMS that minute.
    expect(store.getFibCycle()).toBe(1);

    // Next SMS lands at minute 8 (= 7 + F(1)) with fibIndex 1, fibMinute 1.
    scheduler.tick(); // minute 8
    const afterReset = store
      .snapshot()
      .sms.slice()
      .sort((a, b) => a.seq - b.seq);
    expect(afterReset).toHaveLength(4);
    const newest = afterReset[afterReset.length - 1]!;
    expect(newest.fibIndex).toBe(1);
    expect(newest.fibMinute).toBe(1);
    expect(newest.fibCycle).toBe(1);
  });
});

describe("createScheduler — Email reset (ADR-0005)", () => {
  it("increments emailCycle at emailResetMinutes; the summary that minute carries the new cycle", () => {
    const store = createStore({
      tickMs: 60,
      fibonacciResetMinutes: 100,
      emailResetMinutes: 5,
    });
    const scheduler = createScheduler(store);

    for (let i = 0; i < 4; i += 1) scheduler.tick();
    expect(store.getEmailCycle()).toBe(0);

    scheduler.tick(); // minute 5 → email reset fires
    expect(store.getEmailCycle()).toBe(1);

    const summaries = summaryEmails(store).slice().sort((a, b) => a.seq - b.seq);
    expect(summaries).toHaveLength(5);
    // First four belong to cycle 0; the minute-5 summary carries cycle 1.
    expect(summaries.slice(0, 4).every((e) => e.emailCycle === 0)).toBe(true);
    expect(summaries[4]!.emailCycle).toBe(1);
  });
});

describe("createScheduler — resilience", () => {
  it("catches an error thrown inside a tick; later ticks still run", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const orig = store.appendSummaryEmail.bind(store);
    let calls = 0;
    vi.spyOn(store, "appendSummaryEmail").mockImplementation(() => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return orig();
    });

    expect(() => scheduler.tick()).not.toThrow();
    expect(errSpy).toHaveBeenCalled();

    // Subsequent tick still works (interval stays alive).
    expect(() => scheduler.tick()).not.toThrow();
    expect(summaryEmails(store)).toHaveLength(1);

    vi.restoreAllMocks();
  });
});

describe("createScheduler — start()/stop() single-flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() wires exactly one interval; a second start() is a no-op", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    scheduler.start();
    expect(scheduler.started).toBe(true);
    scheduler.start(); // no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // Advancing wall-time by N*tickMs produces exactly N ticks (one interval).
    vi.advanceTimersByTime(CONFIG.tickMs * 3);
    expect(summaryEmails(store)).toHaveLength(3);

    scheduler.stop();
    expect(scheduler.started).toBe(false);
    vi.advanceTimersByTime(CONFIG.tickMs * 3);
    expect(summaryEmails(store)).toHaveLength(3); // no more ticks after stop()

    setIntervalSpy.mockRestore();
  });
});
