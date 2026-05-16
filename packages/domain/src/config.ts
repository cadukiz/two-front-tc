import { z } from "zod";

/**
 * Time model (ADR-0004, **superseded in part by ADR-0009**). One scheduler
 * tick = one minute = `tickMs` milliseconds. `tickMs` is **internal / test-only**
 * (E2E time-compression) — it is NOT user-facing, NOT in `Snapshot.config`, and
 * NOT mutable via `PATCH /api/config`. Demo runs at 60_000 (1 tick = 60 s); E2E
 * sets a small value so the whole cadence compresses.
 */
export const DEFAULT_TICK_MS = 60_000;

/** Defaults for the three user-facing, runtime-configurable cadence values (ADR-0009). */
export const DEFAULT_EMAIL_SUMMARY_INTERVAL_MINUTES = 1;
export const DEFAULT_SMS_BASE_INTERVAL_MINUTES = 1;
export const DEFAULT_FIBONACCI_RESET_DAYS = 1;

/** Each user-facing cadence value is an integer in [1, 100]. */
const cadenceInt = z.number().int().min(1).max(100);

/**
 * The three user-facing, runtime-mutable cadence settings (ADR-0009). This is
 * what `Snapshot.config` carries and what the Time Controls sliders bind to.
 * `tickMs` is intentionally NOT here — it is internal/test-only.
 */
export const RuntimeConfigSchema = z.object({
  /**
   * Summary email fires every N minutes (`minuteCount % N === 0`). Default 1
   * ⇒ every tick (the brief's "every 1 minute"). Supersedes ADR-0005's
   * `emailResetMinutes`/`emailCycle` (the email reset-cycle concept is dropped).
   */
  emailSummaryIntervalMinutes: cadenceInt,
  /**
   * SMS Fibonacci gaps = `F(k) × smsBaseIntervalMinutes` minutes. Default 1 ⇒
   * the unchanged 1,1,2,3,5,8… cadence.
   */
  smsBaseIntervalMinutes: cadenceInt,
  /**
   * Every N days the SMS Fibonacci sequence restarts (`fibCycle++`).
   * Internally 1 day = 1440 minutes.
   */
  fibonacciResetDays: cadenceInt,
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * `PATCH /api/config` body: any non-empty subset of the runtime config. Each
 * present key is range-validated; an empty object (no keys) is rejected at the
 * route as `bad_request`.
 */
export const PatchConfigRequestSchema = RuntimeConfigSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "At least one config field is required." },
);
export type PatchConfigRequest = z.infer<typeof PatchConfigRequestSchema>;

/**
 * Full server-resolved config: the three user-facing ints plus the internal
 * `tickMs`. The store holds this; only the `RuntimeConfig` subset is surfaced.
 */
export const ConfigSchema = RuntimeConfigSchema.extend({
  /** Wall-clock ms that represent one minute. Internal / test-only (ADR-0009). */
  tickMs: z.number().int().positive(),
});
export type Config = z.infer<typeof ConfigSchema>;

export type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * Resolve runtime config from an env-like map (the server passes `process.env`;
 * the domain package stays runtime-agnostic and dependency-free apart from Zod).
 * **Every value has a default so the app runs with no env at all** (ADR-0009):
 * `tickMs` → {@link DEFAULT_TICK_MS}; the three cadence ints → 1.
 */
export function resolveConfig(env: EnvLike): Config {
  const toNum = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw.trim() === "") {
      return fallback;
    }
    return Number(raw);
  };
  return ConfigSchema.parse({
    tickMs: toNum(env["TICK_MS"], DEFAULT_TICK_MS),
    emailSummaryIntervalMinutes: toNum(
      env["EMAIL_SUMMARY_INTERVAL_MINUTES"],
      DEFAULT_EMAIL_SUMMARY_INTERVAL_MINUTES,
    ),
    smsBaseIntervalMinutes: toNum(
      env["SMS_BASE_INTERVAL_MINUTES"],
      DEFAULT_SMS_BASE_INTERVAL_MINUTES,
    ),
    fibonacciResetDays: toNum(
      env["FIBONACCI_RESET_DAYS"],
      DEFAULT_FIBONACCI_RESET_DAYS,
    ),
  });
}

/** Project the user-facing `RuntimeConfig` out of a full `Config`. */
export function toRuntimeConfig(cfg: Config): RuntimeConfig {
  return {
    emailSummaryIntervalMinutes: cfg.emailSummaryIntervalMinutes,
    smsBaseIntervalMinutes: cfg.smsBaseIntervalMinutes,
    fibonacciResetDays: cfg.fibonacciResetDays,
  };
}

/** Minutes per day — the Fibonacci reset window is configured in days (ADR-0009). */
export const MINUTES_PER_DAY = 1440;

/** Convert minutes to wall-clock milliseconds for the scheduler. */
export function minutesToMs(minutes: number, cfg: Config): number {
  return minutes * cfg.tickMs;
}
