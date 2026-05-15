import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SseEventSchema,
  SnapshotSchema,
  type Config,
  type SseEvent,
} from "@twofront/domain";
import { createStore } from "./store";
import { openSseStream, formatSseFrame } from "./sse";

const CONFIG: Config = {
  tickMs: 60,
  fibonacciResetMinutes: 100,
  emailResetMinutes: 100,
};

/** Read and decode the next chunk from a stream reader. */
async function nextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const { value, done } = await reader.read();
  if (done || value === undefined) throw new Error("stream ended unexpectedly");
  return new TextDecoder().decode(value);
}

beforeEach(() => {
  // openSseStream() → ensureSchedulerStarted() → getStore() → resolveConfig
  // reads process.env. Provide the required reset windows so it validates
  // without touching real env (mirrors store.test.ts).
  process.env.FIBONACCI_RESET_MINUTES = "100";
  process.env.EMAIL_RESET_MINUTES = "100";
});

afterEach(() => {
  // ensureSchedulerStarted() creates a globalThis singleton; clear it (and the
  // store singleton) so SSE tests stay isolated and never leave a live
  // interval running.
  const g = globalThis as {
    __twofront_scheduler?: { stop(): void };
    __twofront?: unknown;
  };
  g.__twofront_scheduler?.stop();
  delete g.__twofront_scheduler;
  delete g.__twofront;
});

describe("formatSseFrame", () => {
  it("formats a snapshot event with id/event/data lines and a blank-line terminator", () => {
    const store = createStore(CONFIG);
    const snap = store.snapshot();
    const evt: SseEvent = { type: "snapshot", seq: snap.lastSeq, data: snap };
    const frame = formatSseFrame(evt);
    expect(frame).toBe(
      `id: ${evt.seq}\nevent: snapshot\ndata: ${JSON.stringify(evt)}\n\n`,
    );
  });

  it("formats a task.created event", () => {
    const store = createStore(CONFIG);
    const { task } = store.addTask("Frame me");
    const evt: SseEvent = { type: "task.created", seq: task.seq, data: task };
    expect(formatSseFrame(evt)).toBe(
      `id: ${task.seq}\nevent: task.created\ndata: ${JSON.stringify(evt)}\n\n`,
    );
  });

  it("formats an sms.created event", () => {
    const store = createStore(CONFIG);
    const sms = store.appendSms({ fibIndex: 1, fibMinute: 1 });
    const evt: SseEvent = { type: "sms.created", seq: sms.seq, data: sms };
    expect(formatSseFrame(evt)).toBe(
      `id: ${sms.seq}\nevent: sms.created\ndata: ${JSON.stringify(evt)}\n\n`,
    );
  });
});

describe("openSseStream — snapshot-first", () => {
  it("first chunk is the snapshot event and its data validates against SnapshotSchema", async () => {
    const store = createStore(CONFIG);
    store.addTask("Pre-existing");
    const stream = openSseStream(store);
    const reader = stream.getReader();

    const first = await nextChunk(reader);
    expect(first.startsWith(`id: ${store.snapshot().lastSeq}\n`)).toBe(true);
    expect(first).toContain("event: snapshot\n");
    expect(first.endsWith("\n\n")).toBe(true);

    const dataLine = first
      .split("\n")
      .find((l) => l.startsWith("data: "))!
      .slice("data: ".length);
    const parsed = JSON.parse(dataLine) as unknown;
    const evt = SseEventSchema.parse(parsed);
    expect(evt.type).toBe("snapshot");
    if (evt.type === "snapshot") {
      expect(SnapshotSchema.safeParse(evt.data).success).toBe(true);
      expect(evt.data.tasks.map((t) => t.title)).toContain("Pre-existing");
    }

    await reader.cancel();
  });

  it("delivers task.created then email.created after addTask, in seq order", async () => {
    const store = createStore(CONFIG);
    const stream = openSseStream(store);
    const reader = stream.getReader();

    await nextChunk(reader); // discard snapshot

    store.addTask("Live task");

    const c1 = await nextChunk(reader);
    expect(c1).toContain("event: task.created\n");
    const c2 = await nextChunk(reader);
    expect(c2).toContain("event: email.created\n");

    const seq1 = Number(c1.split("\n")[0]!.slice("id: ".length));
    const seq2 = Number(c2.split("\n")[0]!.slice("id: ".length));
    expect(seq2).toBeGreaterThan(seq1);

    await reader.cancel();
  });
});

describe("openSseStream — heartbeat", () => {
  it("enqueues a ':\\n\\n' comment after the injected heartbeat timer fires", async () => {
    const store = createStore(CONFIG);
    let fired: (() => void) | undefined;
    let capturedMs: number | undefined;
    const fakeSetInterval = vi.fn((fn: () => void, ms?: number) => {
      fired = fn;
      capturedMs = ms;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const fakeClearInterval = vi.fn();

    const stream = openSseStream(store, {
      heartbeatMs: 15000,
      setInterval: fakeSetInterval as unknown as typeof setInterval,
      clearInterval: fakeClearInterval as unknown as typeof clearInterval,
    });
    const reader = stream.getReader();
    await nextChunk(reader); // snapshot

    expect(fakeSetInterval).toHaveBeenCalledTimes(1);
    expect(capturedMs).toBe(15000);

    expect(fired).toBeDefined();
    fired!();
    const beat = await nextChunk(reader);
    expect(beat).toBe(":\n\n");

    await reader.cancel();
    expect(fakeClearInterval).toHaveBeenCalled();
  });
});

describe("openSseStream — lifecycle", () => {
  it("cancel() unsubscribes: further store emits do not enqueue", async () => {
    const store = createStore(CONFIG);
    const stream = openSseStream(store);
    const reader = stream.getReader();
    await nextChunk(reader); // snapshot

    await reader.cancel();

    // After cancel the listener is gone — emitting must not throw and the
    // subscriber count returns to zero (assert via a fresh subscribe probe:
    // emitting reaches only the probe, never the cancelled stream).
    const seen: SseEvent[] = [];
    store.subscribe((e) => seen.push(e));
    store.addTask("After cancel");
    expect(seen.map((e) => e.type)).toEqual(["task.created", "email.created"]);
  });

  it("a closed controller self-cleans (dead listener does not wedge the store)", async () => {
    const store = createStore(CONFIG);
    const stream = openSseStream(store);
    const reader = stream.getReader();
    await nextChunk(reader); // snapshot
    await reader.cancel(); // controller now closed → listener removed

    // The store should still serve other listeners normally afterwards.
    const seen: SseEvent[] = [];
    store.subscribe((e) => seen.push(e));
    expect(() => store.addTask("Still works")).not.toThrow();
    expect(seen).toHaveLength(2);
  });
});
