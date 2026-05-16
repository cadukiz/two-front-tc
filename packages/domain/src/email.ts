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
   * `summary` → snapshot of the pending tasks at send time as `{ id, title }`
   * pairs (the `id` makes each listed task unambiguously completable from the
   * email action — ADR-0010; a bare title is not unique). May be empty: empty
   * summaries still fire (ADR-0004). `null` for `immediate`.
   */
  pending: z
    .array(z.object({ id: IdSchema, title: z.string() }))
    .nullable(),
  /** Epoch ms — display only. */
  createdAt: z.number().int().nonnegative(),
});
export type Email = z.infer<typeof EmailSchema>;
