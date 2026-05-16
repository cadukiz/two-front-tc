import { describe, it, expect } from "vitest";
import { SseEventSchema, SSE_EVENT_TYPES } from "./events";

describe("SseEvent — config.updated (ADR-0009)", () => {
  it("is a member of SSE_EVENT_TYPES", () => {
    expect(SSE_EVENT_TYPES).toContain("config.updated");
  });

  it("parses a config.updated frame carrying a RuntimeConfig", () => {
    const evt = {
      type: "config.updated" as const,
      seq: 12,
      data: {
        emailSummaryIntervalMinutes: 3,
        smsBaseIntervalMinutes: 2,
        fibonacciResetDays: 5,
      },
    };
    const parsed = SseEventSchema.parse(evt);
    expect(parsed.type).toBe("config.updated");
    if (parsed.type === "config.updated") {
      expect(parsed.data.smsBaseIntervalMinutes).toBe(2);
    }
  });

  it("rejects a config.updated frame with tickMs / out-of-range data", () => {
    expect(
      SseEventSchema.safeParse({
        type: "config.updated",
        seq: 1,
        data: {
          emailSummaryIntervalMinutes: 0,
          smsBaseIntervalMinutes: 1,
          fibonacciResetDays: 1,
        },
      }).success,
    ).toBe(false);
  });
});
