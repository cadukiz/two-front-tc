import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { MINUTES_PER_DAY, type Config } from "@twofront/domain";
import { createStore, type Store } from "./store";
import { createScheduler } from "./scheduler";

/**
 * Injected config literal — no `process.env`, no real timers. `fibonacciResetDays`
 * is set wide by default so the day-based window (× 1440) never interferes with
 * cadence/SMS tests; the reset test overrides it with its own `createStore`.
 */
const CONFIG: Config = {
  tickMs: 60,
  emailSummaryIntervalMinutes: 1,
  fibonacciResetDays: 100,
};

const summaryEmails = (store: Store) =>
  store.snapshot().emails.filter((e) => e.kind === "summary");

const sentSms = (store: Store) =>
  store.snapshot().sms.slice().sort((a, b) => a.seq - b.seq);

describe("createScheduler — summary email cadence (ADR-0009)", () => {
  it("creates one summary email every tick at the default interval (1)", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    for (let i = 0; i < 10; i += 1) scheduler.tick();

    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(10);
    for (const s of summaries) {
      expect(s.pending).toEqual([]);
      expect("emailCycle" in s).toBe(false);
    }
  });

  it("fires only every N minutes when emailSummaryIntervalMinutes = N", () => {
    const store = createStore({ ...CONFIG, emailSummaryIntervalMinutes: 3 });
    const scheduler = createScheduler(store);
    for (let i = 0; i < 10; i += 1) scheduler.tick();
    // minutes 3, 6, 9 → 3 summaries.
    expect(summaryEmails(store)).toHaveLength(3);
  });

  it("summary email reflects pending titles created before the tick", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    const { task: alpha } = store.addTask("Alpha");
    scheduler.tick();
    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.pending).toEqual([{ id: alpha.id, title: "Alpha" }]);
  });
});

describe("createScheduler — Fibonacci SMS cadence (ADR-0004/0009)", () => {
  it("sends SMS at cumulative minutes 1,2,4,7,12,20 with correct fibIndex/fibMinute", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    for (let i = 0; i < 25; i += 1) scheduler.tick();

    const sent = sentSms(store);
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

    scheduler.tick(); // m1 → send #1
    scheduler.tick(); // m2 → send #2
    expect(store.snapshot().sms).toHaveLength(2);
    scheduler.tick(); // m3 → no send
    expect(store.snapshot().sms).toHaveLength(2);
    scheduler.tick(); // m4 → send #3
    expect(store.snapshot().sms).toHaveLength(3);
  });

  it("SMS gap minutes are always the natural F(k) (the pace is not configurable)", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    for (let i = 0; i < 25; i += 1) scheduler.tick();
    const sent = sentSms(store);
    // Unchanged 1,1,2,3,5,8… cadence — there is no base multiplier.
    expect(sent.map((s) => s.fibMinute)).toEqual([1, 1, 2, 3, 5, 8]);
  });
});

describe("createScheduler — Fibonacci reset (ADR-0009, days × 1440)", () => {
  it("restarts the sequence after fibonacciResetDays days; no SMS on the reset minute", () => {
    // `fibonacciResetDays: 1` ⇒ a 1440-minute reset window (days × 1440).
    // `scheduler.tick()` advances one simulated minute regardless of `tickMs`
    // (no real timers here), so we drive 1440 ticks; assert the reset bumps
    // the cycle on minute 1440 and the sequence re-anchors at minute 1441.
    const store = createStore({ ...CONFIG, fibonacciResetDays: 1 });
    const scheduler = createScheduler(store);
    const windowMin = 1 * MINUTES_PER_DAY; // 1440

    // Before the window: a full natural sequence fires (1,2,4,7,12,20,...).
    for (let i = 0; i < windowMin - 1; i += 1) scheduler.tick();
    expect(store.getFibCycle()).toBe(0);
    expect(sentSms(store).every((s) => s.fibCycle === 0)).toBe(true);

    // Minute 1440: reset fires (cycle++), and NO SMS is sent that minute.
    const smsBefore = store.snapshot().sms.length;
    scheduler.tick(); // minute 1440
    expect(store.getFibCycle()).toBe(1);
    expect(store.snapshot().sms.length).toBe(smsBefore);

    // Next SMS lands at minute 1441 (= 1440 + F(1)) with fibIndex 1, cycle 1.
    scheduler.tick(); // minute 1441
    const newest = sentSms(store).at(-1)!;
    expect(newest.fibIndex).toBe(1);
    expect(newest.fibMinute).toBe(1);
    expect(newest.fibCycle).toBe(1);
  });
});

describe("createScheduler — recomputeFromConfig determinism (ADR-0009)", () => {
  it("a config change never disturbs the (non-configurable) SMS Fibonacci pace", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    store.setConfigChangeHandler(() => scheduler.recomputeFromConfig());

    // Run to minute 2: sends at m1 (idx1) and m2 (idx2); pending gap idx3
    // (F=2), anchored at m2 → fires at m4 (2 + 2).
    scheduler.tick(); // m1
    scheduler.tick(); // m2
    expect(sentSms(store)).toHaveLength(2);

    // Change an UNRELATED config field mid-run. The SMS cadence is unaffected
    // — gap idx3 still lands at m4 with the natural F(3)=2.
    store.setRuntimeConfig({ emailSummaryIntervalMinutes: 9 });

    scheduler.tick(); // m3 → no SMS
    expect(sentSms(store)).toHaveLength(2);
    scheduler.tick(); // m4 → send idx3, gap F(3)=2
    const sent = sentSms(store);
    expect(sent).toHaveLength(3);
    expect(sent[2]!.fibIndex).toBe(3);
    expect(sent[2]!.fibMinute).toBe(2);
  });

  it("a shrunk reset window already past-due resets immediately on recompute", () => {
    const store = createStore({ ...CONFIG, fibonacciResetDays: 100 });
    const scheduler = createScheduler(store);
    store.setConfigChangeHandler(() => scheduler.recomputeFromConfig());

    for (let i = 0; i < MINUTES_PER_DAY * 2; i += 1) scheduler.tick();
    expect(store.getFibCycle()).toBe(0); // 2 days ≪ 100-day window

    // Shrink the window to 1 day; 2 days already elapsed ⇒ reset fires NOW.
    store.setRuntimeConfig({ fibonacciResetDays: 1 });
    expect(store.getFibCycle()).toBe(1);
  });

  it("the summary interval is honoured live without any explicit recompute", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    store.setConfigChangeHandler(() => scheduler.recomputeFromConfig());

    scheduler.tick(); // m1 → summary (interval 1)
    scheduler.tick(); // m2 → summary
    expect(summaryEmails(store)).toHaveLength(2);

    store.setRuntimeConfig({ emailSummaryIntervalMinutes: 5 });
    for (let m = 3; m <= 9; m += 1) scheduler.tick(); // only m5 % 5 == 0
    expect(summaryEmails(store)).toHaveLength(3); // m1,m2,m5
    scheduler.tick(); // m10 → m10 % 5 == 0
    expect(summaryEmails(store)).toHaveLength(4);
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

describe("createScheduler — startup notifications (ADR-0004 D3)", () => {
  it("emitStartup emits EXACTLY one summary email + one SMS immediately", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    scheduler.emitStartup();

    expect(summaryEmails(store)).toHaveLength(1);
    const sent = sentSms(store);
    expect(sent).toHaveLength(1);
    // The startup SMS is the FIRST Fibonacci send: idx 1, F(1)=1, cycle 0.
    expect(sent[0]!.fibIndex).toBe(1);
    expect(sent[0]!.fibMinute).toBe(1);
    expect(sent[0]!.fibCycle).toBe(0);
  });

  it("the startup summary reflects current pending (empty ⇒ the no-pending path still fires)", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    scheduler.emitStartup();
    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.pending).toEqual([]);
    expect(summaries[0]!.body).toContain("No pending tasks.");
  });

  it("the startup summary lists tasks that are pending at boot time", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    const { task: alpha } = store.addTask("Alpha");

    scheduler.emitStartup();
    const summaries = summaryEmails(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.pending).toEqual([{ id: alpha.id, title: "Alpha" }]);
  });

  it("single-flight: a second emitStartup() is a strict no-op (no duplicates)", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    scheduler.emitStartup();
    scheduler.emitStartup(); // reconnect / hot-reload — must NOT re-emit
    scheduler.emitStartup();

    expect(summaryEmails(store)).toHaveLength(1);
    expect(sentSms(store)).toHaveLength(1);
  });

  it("single-flight holds across start(): start() emits once; a second start() never re-emits", () => {
    vi.useFakeTimers();
    try {
      const store = createStore(CONFIG);
      const scheduler = createScheduler(store);

      scheduler.start();
      scheduler.start(); // reconnect — no double startup, no double interval

      // Exactly one of each at start, BEFORE any tick has run.
      expect(summaryEmails(store)).toHaveLength(1);
      expect(sentSms(store)).toHaveLength(1);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the recurring sequence CONTINUES from the startup send (no duplicate idx-1 at minute 1)", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);

    // Startup = the first Fibonacci send (minute 0, idx 1).
    scheduler.emitStartup();
    // Now drive 25 minutes of recurring ticks; with the startup send already
    // consuming idx 1 (re-anchored at minute 0, next gap idx 2 = F(2)=1 → m1),
    // the deterministic send schedule is (minute:idx): 0:1, 1:2, 3:3, 6:4,
    // 11:5, 19:6. So after 25 ticks we expect 6 sends total (incl. startup).
    for (let i = 0; i < 25; i += 1) scheduler.tick();

    const sent = sentSms(store);
    expect(sent).toHaveLength(6);
    const expected = [
      { fibIndex: 1, fibMinute: 1 }, // startup (minute 0)
      { fibIndex: 2, fibMinute: 1 }, // minute 1
      { fibIndex: 3, fibMinute: 2 }, // minute 3
      { fibIndex: 4, fibMinute: 3 }, // minute 6
      { fibIndex: 5, fibMinute: 5 }, // minute 11
      { fibIndex: 6, fibMinute: 8 }, // minute 19
    ];
    sent.forEach((m, i) => {
      expect(m.fibIndex).toBe(expected[i]!.fibIndex);
      expect(m.fibMinute).toBe(expected[i]!.fibMinute);
      expect(m.fibCycle).toBe(0);
    });
    // Crucially: NO duplicate idx-1 send at minute 1 — minute 1 is idx 2.
    expect(sent.filter((m) => m.fibIndex === 1)).toHaveLength(1);
  });

  it("the recurring summary continues on its normal cadence after the startup one", () => {
    // Interval 3: without startup, summaries land at minutes 3,6,9 (3 in 10
    // ticks). The startup summary is ADDITIVE and does NOT shift the cadence
    // (it's a pure function of minuteCount, untouched by emitStartup).
    const store = createStore({ ...CONFIG, emailSummaryIntervalMinutes: 3 });
    const scheduler = createScheduler(store);

    scheduler.emitStartup(); // +1 summary (minute 0)
    for (let i = 0; i < 10; i += 1) scheduler.tick(); // minutes 3,6,9 → +3

    expect(summaryEmails(store)).toHaveLength(4); // 1 startup + 3 recurring
  });

  it("with interval 1 the startup summary precedes the every-minute recurring summaries", () => {
    const store = createStore(CONFIG); // emailSummaryIntervalMinutes: 1
    const scheduler = createScheduler(store);

    scheduler.emitStartup(); // +1 (minute 0)
    for (let i = 0; i < 10; i += 1) scheduler.tick(); // minutes 1..10 → +10

    expect(summaryEmails(store)).toHaveLength(11);
  });
});

describe("createScheduler — start()/stop() single-flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() wires exactly one interval (using store.tickMs); a second start() is a no-op", () => {
    const store = createStore(CONFIG);
    const scheduler = createScheduler(store);
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    scheduler.start();
    expect(scheduler.started).toBe(true);
    scheduler.start(); // no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // start() also emits the one-time startup pair (ADR-0004 D3), exactly
    // once even though start() was called twice — single-flight.
    expect(summaryEmails(store)).toHaveLength(1); // 1 startup, no ticks yet
    expect(sentSms(store)).toHaveLength(1);

    // Advancing wall-time by N*tickMs produces exactly N ticks (one interval).
    // Summaries fire every minute (interval 1) ⇒ 1 startup + 3 recurring.
    vi.advanceTimersByTime(CONFIG.tickMs * 3);
    expect(summaryEmails(store)).toHaveLength(4);

    scheduler.stop();
    expect(scheduler.started).toBe(false);
    vi.advanceTimersByTime(CONFIG.tickMs * 3);
    expect(summaryEmails(store)).toHaveLength(4); // no more ticks after stop()

    setIntervalSpy.mockRestore();
  });
});
