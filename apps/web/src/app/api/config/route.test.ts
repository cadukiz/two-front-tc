import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RuntimeConfigSchema,
  ApiErrorSchema,
  type SseEvent,
} from "@twofront/domain";
import { getStore } from "../../../server/store";
import { GET, PATCH } from "./route";

/** Reset the globalThis store + scheduler singletons between tests. */
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
  // ADR-0009: cadence vars all default to 1 when unset — keep a known baseline.
  delete process.env.EMAIL_SUMMARY_INTERVAL_MINUTES;
  delete process.env.SMS_BASE_INTERVAL_MINUTES;
  delete process.env.FIBONACCI_RESET_DAYS;
  resetSingletons();
});

afterEach(() => {
  resetSingletons();
});

function patchReq(body: string): Request {
  return new Request("http://localhost/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("GET /api/config", () => {
  it("returns 200 and the current RuntimeConfig (defaults all 1)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = RuntimeConfigSchema.parse(await res.json());
    expect(body).toEqual({
      emailSummaryIntervalMinutes: 1,
      smsBaseIntervalMinutes: 1,
      fibonacciResetDays: 1,
    });
  });
});

describe("PATCH /api/config — valid patches", () => {
  it("applies a single field and returns the full new RuntimeConfig", async () => {
    const res = await PATCH(
      patchReq(JSON.stringify({ emailSummaryIntervalMinutes: 7 })),
    );
    expect(res.status).toBe(200);
    const body = RuntimeConfigSchema.parse(await res.json());
    expect(body.emailSummaryIntervalMinutes).toBe(7);
    expect(body.smsBaseIntervalMinutes).toBe(1);
    expect(body.fibonacciResetDays).toBe(1);
    // Store actually mutated.
    expect(getStore().getRuntimeConfig().emailSummaryIntervalMinutes).toBe(7);
  });

  it("applies each field independently", async () => {
    for (const [key, val] of [
      ["emailSummaryIntervalMinutes", 4],
      ["smsBaseIntervalMinutes", 9],
      ["fibonacciResetDays", 50],
    ] as const) {
      resetSingletons();
      const res = await PATCH(patchReq(JSON.stringify({ [key]: val })));
      expect(res.status).toBe(200);
      const body = RuntimeConfigSchema.parse(await res.json());
      expect(body[key]).toBe(val);
    }
  });

  it("applies a multi-field partial", async () => {
    const res = await PATCH(
      patchReq(
        JSON.stringify({ smsBaseIntervalMinutes: 3, fibonacciResetDays: 8 }),
      ),
    );
    expect(res.status).toBe(200);
    const body = RuntimeConfigSchema.parse(await res.json());
    expect(body.smsBaseIntervalMinutes).toBe(3);
    expect(body.fibonacciResetDays).toBe(8);
    expect(body.emailSummaryIntervalMinutes).toBe(1);
  });

  it("broadcasts a config.updated SSE frame with the new config", async () => {
    const events: SseEvent[] = [];
    getStore().subscribe((e) => events.push(e));
    await PATCH(patchReq(JSON.stringify({ fibonacciResetDays: 12 })));
    const cfg = events.filter((e) => e.type === "config.updated");
    expect(cfg).toHaveLength(1);
    if (cfg[0]!.type === "config.updated") {
      expect(cfg[0]!.data.fibonacciResetDays).toBe(12);
    }
  });
});

describe("PATCH /api/config — rejection (400 bad_request)", () => {
  it("rejects an empty body object", async () => {
    const res = await PATCH(patchReq(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });

  it("rejects an out-of-range value (reject)", async () => {
    for (const bad of [{ fibonacciResetDays: 0 }, { smsBaseIntervalMinutes: 101 }, { emailSummaryIntervalMinutes: 2.5 }]) {
      const res = await PATCH(patchReq(JSON.stringify(bad)));
      expect(res.status).toBe(400);
      expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
    }
    // State unchanged after rejected patches.
    expect(getStore().getRuntimeConfig()).toEqual({
      emailSummaryIntervalMinutes: 1,
      smsBaseIntervalMinutes: 1,
      fibonacciResetDays: 1,
    });
  });

  it("rejects a body that is only an unknown key (empty after strip)", async () => {
    const res = await PATCH(patchReq(JSON.stringify({ tickMs: 5 })));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });

  it("rejects malformed JSON with 400 bad_request", async () => {
    const res = await PATCH(patchReq("{not json"));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });
});
