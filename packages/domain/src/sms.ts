import { z } from "zod";
import { IdSchema } from "./ids";

export const SmsSchema = z.object({
  id: IdSchema,
  seq: z.number().int().nonnegative(),
  body: z.string(),
  /** Current pending task titles at send time. */
  pendingTitles: z.array(z.string()),
  /**
   * Which Fibonacci-reset cycle this SMS belongs to. Increments every
   * `fibonacciResetDays` days (ADR-0009); makes the sequence reset observable.
   */
  fibCycle: z.number().int().nonnegative(),
  /** 1-based position in the current cycle's Fibonacci sequence. */
  fibIndex: z.number().int().positive(),
  /**
   * The gap minutes used for this send = `F(fibIndex) × smsBaseIntervalMinutes`
   * (ADR-0009). At the default base of 1 this equals `F(fibIndex)`.
   */
  fibMinute: z.number().int().positive(),
  /** Epoch ms — display only. */
  createdAt: z.number().int().nonnegative(),
});
export type Sms = z.infer<typeof SmsSchema>;
