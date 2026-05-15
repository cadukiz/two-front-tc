import { describe, it, expect } from "vitest";
import { DEFAULT_TICK_MS, ConfigSchema } from "@twofront/domain";

// Smoke test: the @twofront/domain workspace dependency resolves from the
// web app. The real feature tests land in later waves.
describe("@twofront/domain wiring", () => {
  it("exposes the DEFAULT_TICK_MS demo default", () => {
    expect(DEFAULT_TICK_MS).toBe(60_000);
  });

  it("exposes the Config Zod schema", () => {
    expect(
      ConfigSchema.safeParse({
        tickMs: 60,
        fibonacciResetMinutes: 7,
        emailResetMinutes: 7,
      }).success,
    ).toBe(true);
  });
});
