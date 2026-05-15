import { z } from "zod";
import { TaskSchema } from "./task";
import { EmailSchema } from "./email";
import { SmsSchema } from "./sms";
import { ConfigSchema } from "./config";

/**
 * Full state sent on (re)connect (`GET /api/stream` first frame) and by
 * `GET /api/state`. The listener is attached to the broadcast set *before*
 * this is serialized; clients then ignore any delta with `seq <= lastSeq`
 * (ADR-0006 D5 — no replay buffer).
 */
export const SnapshotSchema = z.object({
  tasks: z.array(TaskSchema),
  emails: z.array(EmailSchema),
  sms: z.array(SmsSchema),
  /** Highest `seq` reflected in this snapshot — reconnect dedupe key. */
  lastSeq: z.number().int().nonnegative(),
  /** Surfaced for transparency and deterministic tests. */
  config: ConfigSchema,
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
