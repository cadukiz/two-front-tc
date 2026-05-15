import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SnapshotSchema } from "@twofront/domain";
import { getStore } from "../../../server/store";
import { GET } from "./route";

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
  process.env.FIBONACCI_RESET_MINUTES = "7";
  process.env.EMAIL_RESET_MINUTES = "7";
  resetSingletons();
});

afterEach(() => {
  resetSingletons();
});

describe("GET /api/state", () => {
  it("returns 200 and a body that validates against SnapshotSchema", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(SnapshotSchema.safeParse(body).success).toBe(true);
  });

  it("reflects a task added via the store", async () => {
    getStore().addTask("Visible in state");
    const res = await GET();
    const snap = SnapshotSchema.parse(await res.json());
    expect(snap.tasks.map((t) => t.title)).toContain("Visible in state");
    expect(snap.lastSeq).toBeGreaterThan(0);
  });
});
