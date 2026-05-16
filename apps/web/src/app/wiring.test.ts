import { describe, it, expect } from "vitest";
import {
  DEFAULT_TICK_MS,
  ConfigSchema,
  RuntimeConfigSchema,
} from "@twofront/domain";

// Smoke test: the @twofront/domain workspace dependency resolves from the
// web app. The real feature tests land in later waves.
describe("@twofront/domain wiring", () => {
  it("exposes the DEFAULT_TICK_MS demo default", () => {
    expect(DEFAULT_TICK_MS).toBe(60_000);
  });

  it("exposes the full Config Zod schema (incl. internal tickMs)", () => {
    expect(
      ConfigSchema.safeParse({
        tickMs: 60,
        emailSummaryIntervalMinutes: 1,
        fibonacciResetDays: 1,
      }).success,
    ).toBe(true);
  });

  it("exposes the user-facing RuntimeConfig schema (no tickMs)", () => {
    expect(
      RuntimeConfigSchema.safeParse({
        emailSummaryIntervalMinutes: 1,
        fibonacciResetDays: 1,
      }).success,
    ).toBe(true);
  });
});
