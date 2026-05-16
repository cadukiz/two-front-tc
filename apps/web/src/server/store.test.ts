import { describe, it, expect, beforeEach } from "vitest";
import {
  TaskSchema,
  EmailSchema,
  SmsSchema,
  SnapshotSchema,
  type Config,
  type RuntimeConfig,
  type SseEvent,
} from "@twofront/domain";
import { createStore, getStore } from "./store";
import { NotFoundError, ValidationError } from "./errors";

const CONFIG: Config = {
  tickMs: 60,
  emailSummaryIntervalMinutes: 1,
  fibonacciResetDays: 7,
};

const RUNTIME: RuntimeConfig = {
  emailSummaryIntervalMinutes: 1,
  fibonacciResetDays: 7,
};

describe("createStore — addTask", () => {
  it("creates a task + immediate email with increasing seq and correct fields", () => {
    const store = createStore(CONFIG);
    const { task, email } = store.addTask("  Buy milk  ");

    expect(TaskSchema.safeParse(task).success).toBe(true);
    expect(EmailSchema.safeParse(email).success).toBe(true);

    expect(task.title).toBe("Buy milk");
    expect(task.status).toBe("pending");
    expect(task.completedAt).toBeNull();
    expect(task.seq).toBe(1);

    expect(email.kind).toBe("immediate");
    expect(email.taskId).toBe(task.id);
    expect(email.pending).toBeNull();
    expect("emailCycle" in email).toBe(false);
    expect(email.subject).toContain("Buy milk");
    expect(email.body).toContain("Buy milk");
    // immediate email seq is strictly after the task seq
    expect(email.seq).toBe(2);
  });

  it("throws ValidationError on empty title and pushes nothing", () => {
    const store = createStore(CONFIG);
    expect(() => store.addTask("")).toThrow(ValidationError);
    expect(() => store.addTask("   ")).toThrow(ValidationError);
    const snap = store.snapshot();
    expect(snap.tasks).toHaveLength(0);
    expect(snap.emails).toHaveLength(0);
    expect(snap.lastSeq).toBe(0);
  });
});

describe("createStore — completeTask", () => {
  it("throws NotFoundError for an unknown id", () => {
    const store = createStore(CONFIG);
    expect(() => store.completeTask("00000000-0000-0000-0000-000000000000")).toThrow(
      NotFoundError,
    );
  });

  it("pending -> completed sets completedAt + new seq + emits exactly one task.completed", () => {
    const store = createStore(CONFIG);
    const events: SseEvent[] = [];
    store.subscribe((e) => events.push(e));

    const { task } = store.addTask("Finish report");
    const beforeSeq = task.seq;

    const { task: done } = store.completeTask(task.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(done.seq).toBeGreaterThan(beforeSeq);

    const completedEvents = events.filter((e) => e.type === "task.completed");
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]?.seq).toBe(done.seq);
  });

  it("second complete is an idempotent no-op (same record, no new event, seq unchanged)", () => {
    const store = createStore(CONFIG);
    const events: SseEvent[] = [];
    store.subscribe((e) => events.push(e));

    const { task } = store.addTask("Idempotent task");
    const first = store.completeTask(task.id);
    const eventCountAfterFirst = events.length;

    const second = store.completeTask(task.id);
    expect(second.task.seq).toBe(first.task.seq);
    expect(second.task.completedAt).toBe(first.task.completedAt);
    expect(events.length).toBe(eventCountAfterFirst);
    expect(store.snapshot().lastSeq).toBe(first.task.seq);
  });
});

describe("createStore — appendSummaryEmail", () => {
  it("fires with 0 pending tasks (pending [])", () => {
    const store = createStore(CONFIG);
    const email = store.appendSummaryEmail();
    expect(EmailSchema.safeParse(email).success).toBe(true);
    expect(email.kind).toBe("summary");
    expect(email.taskId).toBeNull();
    expect(email.pending).toEqual([]);
    expect(email.body).toContain("No pending tasks.");
  });

  it("carries pending {id,title} pairs for the current pending tasks (ADR-0010)", () => {
    const store = createStore(CONFIG);
    const { task: alpha } = store.addTask("Alpha");
    const { task: beta } = store.addTask("Beta");
    const email = store.appendSummaryEmail();
    expect(email.pending).toEqual([
      { id: alpha.id, title: "Alpha" },
      { id: beta.id, title: "Beta" },
    ]);
    expect(email.body).toContain("Alpha");
    expect(email.body).toContain("Beta");
  });

  it("drops a task from `pending` once it is completed (round-trip is visible)", () => {
    const store = createStore(CONFIG);
    const { task: alpha } = store.addTask("Alpha");
    const { task: beta } = store.addTask("Beta");
    store.completeTask(alpha.id);
    const email = store.appendSummaryEmail();
    expect(email.pending).toEqual([{ id: beta.id, title: "Beta" }]);
  });
});

describe("createStore — appendSms", () => {
  it("records fibCycle/fibIndex/fibMinute and pending titles", () => {
    const store = createStore(CONFIG);
    store.addTask("Walk dog");
    const sms = store.appendSms({ fibIndex: 3, fibMinute: 2 });
    expect(SmsSchema.safeParse(sms).success).toBe(true);
    expect(sms.fibCycle).toBe(0);
    expect(sms.fibIndex).toBe(3);
    expect(sms.fibMinute).toBe(2);
    expect(sms.pendingTitles).toEqual(["Walk dog"]);
    expect(sms.body).toContain("Walk dog");
  });

  it("uses 'No pending tasks.' body when none pending", () => {
    const store = createStore(CONFIG);
    const sms = store.appendSms({ fibIndex: 1, fibMinute: 1 });
    expect(sms.pendingTitles).toEqual([]);
    expect(sms.body).toContain("No pending tasks.");
  });
});

describe("createStore — fib cycle control", () => {
  it("bumpFibCycle advances the counter and stamps later SMS", () => {
    const store = createStore(CONFIG);
    expect(store.getFibCycle()).toBe(0);
    store.bumpFibCycle();
    expect(store.getFibCycle()).toBe(1);

    store.addTask("x");
    const sms = store.appendSms({ fibIndex: 1, fibMinute: 1 });
    expect(sms.fibCycle).toBe(1);
  });
});

describe("createStore — runtime config (ADR-0009)", () => {
  it("snapshot().config is the three user-facing ints (no tickMs)", () => {
    const store = createStore(CONFIG);
    const snap = store.snapshot();
    expect(snap.config).toEqual(RUNTIME);
    expect("tickMs" in snap.config).toBe(false);
  });

  it("getRuntimeConfig returns the live config; tickMs is exposed separately", () => {
    const store = createStore(CONFIG);
    expect(store.getRuntimeConfig()).toEqual(RUNTIME);
    expect(store.tickMs).toBe(60);
  });

  it("setRuntimeConfig clamps via schema, updates state, and returns the full new config", () => {
    const store = createStore(CONFIG);
    const next = store.setRuntimeConfig({ emailSummaryIntervalMinutes: 5 });
    expect(next).toEqual({ ...RUNTIME, emailSummaryIntervalMinutes: 5 });
    expect(store.getRuntimeConfig().emailSummaryIntervalMinutes).toBe(5);
    expect(store.snapshot().config.emailSummaryIntervalMinutes).toBe(5);
  });

  it("setRuntimeConfig strips the removed smsBaseIntervalMinutes key", () => {
    const store = createStore(CONFIG);
    const next = store.setRuntimeConfig({
      fibonacciResetDays: 3,
      // @ts-expect-error — smsBaseIntervalMinutes is no longer a config key.
      smsBaseIntervalMinutes: 9,
    });
    expect(next).toEqual({ ...RUNTIME, fibonacciResetDays: 3 });
    expect("smsBaseIntervalMinutes" in next).toBe(false);
  });

  it("setRuntimeConfig rejects out-of-range values (throws ZodError)", () => {
    const store = createStore(CONFIG);
    expect(() => store.setRuntimeConfig({ fibonacciResetDays: 0 })).toThrow();
    expect(() =>
      store.setRuntimeConfig({ emailSummaryIntervalMinutes: 101 }),
    ).toThrow();
    // State unchanged after a rejected patch.
    expect(store.getRuntimeConfig()).toEqual(RUNTIME);
  });

  it("setRuntimeConfig emits a config.updated SSE frame carrying the new config", () => {
    const store = createStore(CONFIG);
    const events: SseEvent[] = [];
    store.subscribe((e) => events.push(e));
    store.setRuntimeConfig({ fibonacciResetDays: 9 });
    const cfgEvents = events.filter((e) => e.type === "config.updated");
    expect(cfgEvents).toHaveLength(1);
    const evt = cfgEvents[0]!;
    if (evt.type === "config.updated") {
      expect(evt.data).toEqual({ ...RUNTIME, fibonacciResetDays: 9 });
      expect(evt.seq).toBeGreaterThan(0);
    }
  });

  it("invokes the registered config-change handler BEFORE broadcasting", () => {
    const store = createStore(CONFIG);
    const order: string[] = [];
    store.setConfigChangeHandler(() => order.push("recompute"));
    store.subscribe((e) => {
      if (e.type === "config.updated") order.push("broadcast");
    });
    store.setRuntimeConfig({ emailSummaryIntervalMinutes: 4 });
    expect(order).toEqual(["recompute", "broadcast"]);
  });
});

describe("createStore — snapshot", () => {
  it("validates against SnapshotSchema and is newest-first by seq", () => {
    const store = createStore(CONFIG);
    store.addTask("First");
    store.addTask("Second");
    const snap = store.snapshot();
    expect(SnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.config).toEqual(RUNTIME);
    // newest-first by seq
    for (let i = 1; i < snap.tasks.length; i += 1) {
      expect(snap.tasks[i - 1]!.seq).toBeGreaterThan(snap.tasks[i]!.seq);
    }
    for (let i = 1; i < snap.emails.length; i += 1) {
      expect(snap.emails[i - 1]!.seq).toBeGreaterThan(snap.emails[i]!.seq);
    }
    expect(snap.tasks[0]!.title).toBe("Second");
    expect(snap.lastSeq).toBe(store.snapshot().lastSeq);
  });

  it("caps each feed at the last 200 (drops oldest)", () => {
    const store = createStore(CONFIG);
    for (let i = 0; i < 250; i += 1) {
      store.appendSms({ fibIndex: 1, fibMinute: 1 });
    }
    const snap = store.snapshot();
    expect(snap.sms).toHaveLength(200);
    // newest-first: index 0 is the most recent (highest seq)
    expect(snap.sms[0]!.seq).toBeGreaterThan(snap.sms[199]!.seq);
    // oldest 50 dropped — smallest retained seq corresponds to the 51st send
    const minRetainedSeq = Math.min(...snap.sms.map((s) => s.seq));
    expect(minRetainedSeq).toBe(51);
  });

  it("evicts on push: the internal array stays ≤200 independently of snapshot() slicing", () => {
    const store = createStore(CONFIG);
    for (let i = 0; i < 250; i += 1) {
      store.appendSms({ fibIndex: 1, fibMinute: 1 });
    }
    // Probe the raw internal array length — NOT routed through snapshot()'s
    // newest-first slice. If eviction were only happening at snapshot time the
    // internal array would be 250; on-push eviction keeps it bounded at 200.
    const lengths = store.__internalFeedLengths();
    expect(lengths.sms).toBe(200);
    expect(lengths.sms).toBeLessThanOrEqual(200);
    // And the slice-based view agrees.
    expect(store.snapshot().sms).toHaveLength(200);
  });
});

describe("createStore — pub/sub", () => {
  it("delivers events in order and unsubscribe stops delivery", () => {
    const store = createStore(CONFIG);
    const events: SseEvent[] = [];
    const unsub = store.subscribe((e) => events.push(e));
    store.addTask("One");
    expect(events.map((e) => e.type)).toEqual(["task.created", "email.created"]);
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

    unsub();
    store.addTask("Two");
    expect(events).toHaveLength(2);
  });

  it("a throwing subscriber does not break emit for others", () => {
    const store = createStore(CONFIG);
    const good: SseEvent[] = [];
    store.subscribe(() => {
      throw new Error("bad listener");
    });
    store.subscribe((e) => good.push(e));
    expect(() => store.addTask("Resilient")).not.toThrow();
    expect(good.map((e) => e.type)).toEqual(["task.created", "email.created"]);
  });
});

describe("getStore — singleton", () => {
  beforeEach(() => {
    // ensure a clean global between assertions in this block
    delete (globalThis as { __twofront?: unknown }).__twofront;
    // getStore() resolves config from process.env; with ADR-0009 every value
    // defaults, so resolveConfig works even with no env set.
    delete process.env.EMAIL_SUMMARY_INTERVAL_MINUTES;
    delete process.env.FIBONACCI_RESET_DAYS;
  });

  it("returns the same instance across calls", () => {
    const a = getStore();
    const b = getStore();
    expect(a).toBe(b);
  });
});
