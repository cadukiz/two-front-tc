import { z } from "zod";
import { IdSchema } from "./ids";

export const TaskStatusSchema = z.enum(["pending", "completed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: IdSchema,
  /** Global monotonic ordering key (ADR-0006). Feeds sort by `seq`, not by time. */
  seq: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(500),
  status: TaskStatusSchema,
  /** Epoch ms — display only ("time age"); never used for ordering. */
  createdAt: z.number().int().nonnegative(),
  /** Epoch ms; non-null iff `status === "completed"`. */
  completedAt: z.number().int().nonnegative().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;
