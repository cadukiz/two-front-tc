import { z } from "zod";

/**
 * Time model (ADR-0004): one scheduler tick = one *simulated minute* = `tickMs`
 * milliseconds. Demo runs at 60_000 (1 tick = 60 s); E2E sets a small value so
 * the whole cadence (1-min email, Fibonacci SMS, both reset windows) compresses.
 */
export const DEFAULT_TICK_MS = 60_000;

export const ConfigSchema = z.object({
  /** Wall-clock ms that represent one simulated minute. */
  tickMs: z.number().int().positive(),
  /** ADR-0005: every N simulated minutes the SMS Fibonacci sequence restarts. */
  fibonacciResetMinutes: z.number().int().min(1).max(100),
  /** ADR-0005: every N simulated minutes the email summary cycle counter advances (cadence stays 1 min). */
  emailResetMinutes: z.number().int().min(1).max(100),
});
export type Config = z.infer<typeof ConfigSchema>;

export type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * Resolve runtime config from an env-like map (the server passes `process.env`;
 * the domain package stays runtime-agnostic and dependency-free apart from Zod).
 * `tickMs` defaults to {@link DEFAULT_TICK_MS}; the two reset windows are required
 * and validated to be integers in [1, 100].
 */
export function resolveConfig(env: EnvLike): Config {
  const toNum = (raw: string | undefined, fallback?: number): number => {
    if (raw === undefined || raw.trim() === "") {
      return fallback ?? Number.NaN;
    }
    return Number(raw);
  };
  return ConfigSchema.parse({
    tickMs: toNum(env["TICK_MS"], DEFAULT_TICK_MS),
    fibonacciResetMinutes: toNum(env["FIBONACCI_RESET_MINUTES"]),
    emailResetMinutes: toNum(env["EMAIL_RESET_MINUTES"]),
  });
}

/** Convert simulated minutes to wall-clock milliseconds for the scheduler. */
export function minutesToMs(minutes: number, cfg: Config): number {
  return minutes * cfg.tickMs;
}
