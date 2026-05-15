import { z } from "zod";
import { IdSchema } from "./ids";

export const EmailKindSchema = z.enum(["immediate", "summary"]);
export type EmailKind = z.infer<typeof EmailKindSchema>;

export const EmailSchema = z.object({
  id: IdSchema,
  seq: z.number().int().nonnegative(),
  kind: EmailKindSchema,
  subject: z.string(),
  body: z.string(),
  /**
   * `immediate` → references the task that triggered it (drives the round-trip
   * "Mark complete" link/button). `null` for `summary`.
   */
  taskId: IdSchema.nullable(),
  /**
   * `summary` → snapshot of pending task titles at send time. May be empty:
   * empty summaries still fire (ADR-0004). `null` for `immediate`.
   */
  pendingTitles: z.array(z.string()).nullable(),
  /**
   * Which email-reset cycle this email belongs to. Increments every
   * `emailResetMinutes` (ADR-0005); makes the reset observable/E2E-assertable.
   */
  emailCycle: z.number().int().nonnegative(),
  /** Epoch ms — display only. */
  createdAt: z.number().int().nonnegative(),
});
export type Email = z.infer<typeof EmailSchema>;
