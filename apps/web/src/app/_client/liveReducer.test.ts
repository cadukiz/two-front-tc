import { describe, it, expect } from "vitest";
import type { Task, Email, Sms, Snapshot, SseEvent } from "@twofront/domain";
import { liveReducer, EMPTY_LIVE_STATE } from "./liveReducer";

/* ---------- fixtures ---------- */

const task = (over: Partial<Task> & Pick<Task, "id" | "seq">): Task => ({
  title: "t",
  status: "pending",
  createdAt: 0,
  completedAt: null,
  ...over,
});

const email = (over: Partial<Email> & Pick<Email, "id" | "seq">): Email => ({
  kind: "summary",
  subject: "s",
  body: "b",
  taskId: null,
  pending: [],
  createdAt: 0,
  ...over,
});

const sms = (over: Partial<Sms> & Pick<Sms, "id" | "seq">): Sms => ({
  body: "b",
  pendingTitles: [],
  fibCycle: 0,
  fibIndex: 1,
  fibMinute: 1,
  createdAt: 0,
  ...over,
});

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  tasks: [],
  emails: [],
  sms: [],
  lastSeq: 0,
  config: {
    emailSummaryIntervalMinutes: 1,
    smsBaseIntervalMinutes: 1,
    fibonacciResetDays: 1,
  },
  ...over,
});

const snap = (data: Snapshot): SseEvent => ({
  type: "snapshot",
  seq: data.lastSeq,
  data,
});

/* ---------- tests ---------- */

describe("liveReducer — snapshot seed", () => {
  it("seeds all feeds + lastSeq from a snapshot, newest-first by seq", () => {
    const next = liveReducer(
      EMPTY_LIVE_STATE,
      snap(
        snapshot({
          tasks: [task({ id: "a", seq: 1 }), task({ id: "b", seq: 5 })],
          emails: [email({ id: "e", seq: 4 })],
          sms: [sms({ id: "m", seq: 3 })],
          lastSeq: 5,
        }),
      ),
    );
    expect(next.tasks.map((t) => t.id)).toEqual(["b", "a"]);
    expect(next.emails.map((e) => e.id)).toEqual(["e"]);
    expect(next.sms.map((m) => m.id)).toEqual(["m"]);
    expect(next.lastSeq).toBe(5);
  });

  it("a later snapshot fully replaces prior state (reconnect re-seed)", () => {
    const seeded = liveReducer(
      EMPTY_LIVE_STATE,
      snap(snapshot({ tasks: [task({ id: "old", seq: 9 })], lastSeq: 9 })),
    );
    const reseeded = liveReducer(
      seeded,
      snap(snapshot({ tasks: [task({ id: "new", seq: 12 })], lastSeq: 12 })),
    );
    expect(reseeded.tasks.map((t) => t.id)).toEqual(["new"]);
    expect(reseeded.lastSeq).toBe(12);
  });
});

describe("liveReducer — delta apply", () => {
  it("applies task.created / email.created / sms.created and bumps lastSeq", () => {
    let s = liveReducer(EMPTY_LIVE_STATE, snap(snapshot({ lastSeq: 0 })));
    s = liveReducer(s, {
      type: "task.created",
      seq: 1,
      data: task({ id: "t1", seq: 1 }),
    });
    s = liveReducer(s, {
      type: "email.created",
      seq: 2,
      data: email({ id: "e1", seq: 2 }),
    });
    s = liveReducer(s, {
      type: "sms.created",
      seq: 3,
      data: sms({ id: "s1", seq: 3 }),
    });
    expect(s.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(s.emails.map((e) => e.id)).toEqual(["e1"]);
    expect(s.sms.map((m) => m.id)).toEqual(["s1"]);
    expect(s.lastSeq).toBe(3);
  });

  it("task.completed replaces the task in place (by id), keeping seq order", () => {
    let s = liveReducer(
      EMPTY_LIVE_STATE,
      snap(
        snapshot({
          tasks: [task({ id: "t1", seq: 2 }), task({ id: "t2", seq: 1 })],
          lastSeq: 2,
        }),
      ),
    );
    s = liveReducer(s, {
      type: "task.completed",
      seq: 3,
      data: task({ id: "t1", seq: 3, status: "completed", completedAt: 99 }),
    });
    expect(s.tasks).toHaveLength(2);
    const t1 = s.tasks.find((t) => t.id === "t1");
    expect(t1?.status).toBe("completed");
    // seq 3 is newest → t1 sorts first
    expect(s.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(s.lastSeq).toBe(3);
  });
});

describe("liveReducer — seq <= lastSeq ignored (ADR-0006 D5)", () => {
  it("drops a delta whose seq is not greater than lastSeq", () => {
    const seeded = liveReducer(
      EMPTY_LIVE_STATE,
      snap(snapshot({ lastSeq: 10 })),
    );
    const stale = liveReducer(seeded, {
      type: "task.created",
      seq: 10,
      data: task({ id: "stale", seq: 10 }),
    });
    expect(stale).toBe(seeded); // unchanged reference
    const older = liveReducer(seeded, {
      type: "task.created",
      seq: 4,
      data: task({ id: "older", seq: 4 }),
    });
    expect(older.tasks).toHaveLength(0);
    expect(older.lastSeq).toBe(10);
  });
});

describe("liveReducer — dedupe by id", () => {
  it("re-delivering the same id replaces (no duplicates)", () => {
    let s = liveReducer(EMPTY_LIVE_STATE, snap(snapshot({ lastSeq: 0 })));
    s = liveReducer(s, {
      type: "task.created",
      seq: 1,
      data: task({ id: "dup", seq: 1, title: "first" }),
    });
    s = liveReducer(s, {
      type: "task.completed",
      seq: 2,
      data: task({ id: "dup", seq: 2, title: "first", status: "completed" }),
    });
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0]?.status).toBe("completed");
  });
});

describe("liveReducer — newest-first ordering by seq", () => {
  it("keeps each feed sorted by seq desc as in-order deltas arrive", () => {
    let s = liveReducer(EMPTY_LIVE_STATE, snap(snapshot({ lastSeq: 0 })));
    s = liveReducer(s, {
      type: "sms.created",
      seq: 1,
      data: sms({ id: "m1", seq: 1 }),
    });
    s = liveReducer(s, {
      type: "sms.created",
      seq: 2,
      data: sms({ id: "m2", seq: 2 }),
    });
    s = liveReducer(s, {
      type: "sms.created",
      seq: 3,
      data: sms({ id: "m3", seq: 3 }),
    });
    expect(s.sms.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
  });

  it("drops a later-delivered LOWER-seq delta (ADR-0006 D5 monotonic seq)", () => {
    // The server's `seq` is globally monotonic; a frame with a seq we've
    // already passed is a stale replay, never reordered in.
    let s = liveReducer(EMPTY_LIVE_STATE, snap(snapshot({ lastSeq: 0 })));
    s = liveReducer(s, {
      type: "sms.created",
      seq: 3,
      data: sms({ id: "m3", seq: 3 }),
    });
    s = liveReducer(s, {
      type: "sms.created",
      seq: 2,
      data: sms({ id: "m2", seq: 2 }),
    });
    expect(s.sms.map((m) => m.id)).toEqual(["m3"]);
    expect(s.lastSeq).toBe(3);
  });
});

describe("liveReducer — config.updated (ADR-0009)", () => {
  it("snapshot seeds config; config.updated replaces it without touching lastSeq/feeds", () => {
    const seeded = liveReducer(
      EMPTY_LIVE_STATE,
      snap(
        snapshot({
          sms: [sms({ id: "m1", seq: 2 })],
          lastSeq: 2,
        }),
      ),
    );
    expect(seeded.config).toEqual({
      emailSummaryIntervalMinutes: 1,
      smsBaseIntervalMinutes: 1,
      fibonacciResetDays: 1,
    });

    const next = liveReducer(seeded, {
      type: "config.updated",
      seq: 3,
      data: {
        emailSummaryIntervalMinutes: 5,
        smsBaseIntervalMinutes: 2,
        fibonacciResetDays: 9,
      },
    });
    expect(next.config).toEqual({
      emailSummaryIntervalMinutes: 5,
      smsBaseIntervalMinutes: 2,
      fibonacciResetDays: 9,
    });
    // Feeds + dedupe key untouched (config is not an id/seq-keyed record).
    expect(next.sms.map((m) => m.id)).toEqual(["m1"]);
    expect(next.lastSeq).toBe(2);
  });

  it("applies even when its seq is <= lastSeq (last-write-wins, not gated)", () => {
    const seeded = liveReducer(
      EMPTY_LIVE_STATE,
      snap(snapshot({ lastSeq: 10 })),
    );
    const next = liveReducer(seeded, {
      type: "config.updated",
      seq: 4,
      data: {
        emailSummaryIntervalMinutes: 7,
        smsBaseIntervalMinutes: 7,
        fibonacciResetDays: 7,
      },
    });
    expect(next.config?.smsBaseIntervalMinutes).toBe(7);
    expect(next.lastSeq).toBe(10);
  });
});
