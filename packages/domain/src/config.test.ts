import { describe, it, expect } from "vitest";
import {
  DEFAULT_TICK_MS,
  RuntimeConfigSchema,
  PatchConfigRequestSchema,
  ConfigSchema,
  resolveConfig,
  toRuntimeConfig,
  minutesToMs,
  MINUTES_PER_DAY,
  type Config,
} from "./config";

describe("RuntimeConfigSchema (ADR-0009)", () => {
  it("accepts the three user-facing ints in [1,100]", () => {
    expect(
      RuntimeConfigSchema.safeParse({
        emailSummaryIntervalMinutes: 1,
        smsBaseIntervalMinutes: 100,
        fibonacciResetDays: 50,
      }).success,
    ).toBe(true);
  });

  it("rejects out-of-range / non-integer values", () => {
    for (const bad of [0, 101, 2.5, -1]) {
      expect(
        RuntimeConfigSchema.safeParse({
          emailSummaryIntervalMinutes: bad,
          smsBaseIntervalMinutes: 1,
          fibonacciResetDays: 1,
        }).success,
      ).toBe(false);
    }
  });

  it("does NOT carry tickMs (internal/test-only)", () => {
    const parsed = RuntimeConfigSchema.parse({
      emailSummaryIntervalMinutes: 1,
      smsBaseIntervalMinutes: 1,
      fibonacciResetDays: 1,
    });
    expect("tickMs" in parsed).toBe(false);
  });
});

describe("PatchConfigRequestSchema", () => {
  it("accepts a single-field partial", () => {
    expect(
      PatchConfigRequestSchema.safeParse({ smsBaseIntervalMinutes: 5 }).success,
    ).toBe(true);
  });

  it("accepts a multi-field partial", () => {
    expect(
      PatchConfigRequestSchema.safeParse({
        emailSummaryIntervalMinutes: 3,
        fibonacciResetDays: 9,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty object (no keys)", () => {
    expect(PatchConfigRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an out-of-range value in a partial", () => {
    expect(
      PatchConfigRequestSchema.safeParse({ fibonacciResetDays: 0 }).success,
    ).toBe(false);
    expect(
      PatchConfigRequestSchema.safeParse({ smsBaseIntervalMinutes: 101 })
        .success,
    ).toBe(false);
  });

  it("rejects tickMs (not a user-facing key)", () => {
    // `.partial()` of RuntimeConfigSchema has no tickMs key; strip-by-default
    // means it is simply ignored, so a body with ONLY tickMs is empty → reject.
    expect(
      PatchConfigRequestSchema.safeParse({ tickMs: 10 }).success,
    ).toBe(false);
  });
});

describe("resolveConfig — every value defaults (runs with no env)", () => {
  it("uses all defaults for an empty env", () => {
    const cfg = resolveConfig({});
    expect(cfg.tickMs).toBe(DEFAULT_TICK_MS);
    expect(cfg.emailSummaryIntervalMinutes).toBe(1);
    expect(cfg.smsBaseIntervalMinutes).toBe(1);
    expect(cfg.fibonacciResetDays).toBe(1);
    expect(ConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("reads the new env var names", () => {
    const cfg = resolveConfig({
      TICK_MS: "1000",
      EMAIL_SUMMARY_INTERVAL_MINUTES: "5",
      SMS_BASE_INTERVAL_MINUTES: "7",
      FIBONACCI_RESET_DAYS: "9",
    });
    expect(cfg.tickMs).toBe(1000);
    expect(cfg.emailSummaryIntervalMinutes).toBe(5);
    expect(cfg.smsBaseIntervalMinutes).toBe(7);
    expect(cfg.fibonacciResetDays).toBe(9);
  });

  it("rejects an out-of-range env value", () => {
    expect(() =>
      resolveConfig({ EMAIL_SUMMARY_INTERVAL_MINUTES: "0" }),
    ).toThrow();
  });
});

describe("toRuntimeConfig / minutesToMs / constants", () => {
  it("projects only the three user-facing ints", () => {
    const cfg: Config = {
      tickMs: 60_000,
      emailSummaryIntervalMinutes: 2,
      smsBaseIntervalMinutes: 3,
      fibonacciResetDays: 4,
    };
    const rc = toRuntimeConfig(cfg);
    expect(rc).toEqual({
      emailSummaryIntervalMinutes: 2,
      smsBaseIntervalMinutes: 3,
      fibonacciResetDays: 4,
    });
    expect("tickMs" in rc).toBe(false);
  });

  it("MINUTES_PER_DAY is 1440 and minutesToMs scales by tickMs", () => {
    expect(MINUTES_PER_DAY).toBe(1440);
    const cfg: Config = {
      tickMs: 1000,
      emailSummaryIntervalMinutes: 1,
      smsBaseIntervalMinutes: 1,
      fibonacciResetDays: 1,
    };
    expect(minutesToMs(3, cfg)).toBe(3000);
  });
});
