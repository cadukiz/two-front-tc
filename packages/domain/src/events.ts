import { z } from "zod";
import { TaskSchema } from "./task";
import { EmailSchema } from "./email";
import { SmsSchema } from "./sms";
import { SnapshotSchema } from "./snapshot";
import { RuntimeConfigSchema } from "./config";

/**
 * SSE payloads. Every `data:` frame validates against this discriminated union
 * on both ends (server validates on send, client/E2E parse-validate on receive).
 * Wire frame: `id: <seq>\n` + `event: <type>\n` + `data: <json>\n\n`.
 * Heartbeat is a `:\n\n` comment (~15 s wall-time), not an event.
 */
export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    seq: z.number().int().nonnegative(),
    data: SnapshotSchema,
  }),
  z.object({
    type: z.literal("task.created"),
    seq: z.number().int().nonnegative(),
    data: TaskSchema,
  }),
  z.object({
    type: z.literal("task.completed"),
    seq: z.number().int().nonnegative(),
    data: TaskSchema,
  }),
  z.object({
    type: z.literal("email.created"),
    seq: z.number().int().nonnegative(),
    data: EmailSchema,
  }),
  z.object({
    type: z.literal("sms.created"),
    seq: z.number().int().nonnegative(),
    data: SmsSchema,
  }),
  z.object({
    // ADR-0009: runtime config changed (via `PATCH /api/config`). Broadcast so
    // every connected client reconciles its optimistic slider values.
    type: z.literal("config.updated"),
    seq: z.number().int().nonnegative(),
    data: RuntimeConfigSchema,
  }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

export const SSE_EVENT_TYPES = [
  "snapshot",
  "task.created",
  "task.completed",
  "email.created",
  "sms.created",
  "config.updated",
] as const;
export type SseEventType = (typeof SSE_EVENT_TYPES)[number];
