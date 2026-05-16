import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SseEventSchema } from "@twofront/domain";
import { getStore } from "../../../server/store";
import { GET } from "./route";

/**
 * Open SSE readers must be cancelled and the scheduler stopped after each test
 * — a live heartbeat interval / scheduler interval would leak and hang vitest.
 */
let openReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

function resetSingletons(): void {
  const g = globalThis as {
    __twofront_scheduler?: { stop(): void };
    __twofront?: unknown;
  };
  g.__twofront_scheduler?.stop();
  delete g.__twofront_scheduler;
  delete g.__twofront;
}

beforeEach(() => {
  process.env.TICK_MS = "60";
  // ADR-0009: cadence vars all default; clear them for isolation.
  delete process.env.EMAIL_SUMMARY_INTERVAL_MINUTES;
  delete process.env.SMS_BASE_INTERVAL_MINUTES;
  delete process.env.FIBONACCI_RESET_DAYS;
  resetSingletons();
});

afterEach(async () => {
  if (openReader !== undefined) {
    await openReader.cancel();
    openReader = undefined;
  }
  resetSingletons();
});

describe("GET /api/stream", () => {
  it("returns 200 with SSE headers", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("cache-control")).toContain("no-transform");

    // Drain + close so the heartbeat interval is cleared.
    openReader = res.body!.getReader();
  });

  it("first chunk is a `snapshot` SSE frame that validates", async () => {
    getStore().addTask("Pre-existing");
    const res = GET();
    openReader = res.body!.getReader();

    const { value, done } = await openReader.read();
    expect(done).toBe(false);
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: snapshot\n");
    expect(text.endsWith("\n\n")).toBe(true);

    const dataLine = text
      .split("\n")
      .find((l) => l.startsWith("data: "))!
      .slice("data: ".length);
    const evt = SseEventSchema.parse(JSON.parse(dataLine) as unknown);
    expect(evt.type).toBe("snapshot");
    if (evt.type === "snapshot") {
      expect(evt.data.tasks.map((t) => t.title)).toContain("Pre-existing");
    }
  });
});
