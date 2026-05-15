import { z } from "zod";
import { IdSchema } from "./ids";
import { TaskSchema } from "./task";
import { EmailSchema } from "./email";

/** `POST /api/tasks` body. */
export const CreateTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(500),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/** `POST /api/tasks` result — the immediate email is created synchronously (ADR-0004 D2). */
export const CreateTaskResponseSchema = z.object({
  task: TaskSchema,
  email: EmailSchema,
});
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

/** Path param for both `POST` and `GET` `/api/tasks/:id/complete`. */
export const CompleteTaskParamsSchema = z.object({ id: IdSchema });
export type CompleteTaskParams = z.infer<typeof CompleteTaskParamsSchema>;

/** Complete is idempotent: a re-complete returns the existing record, no new event (ADR-0006 D4). */
export const CompleteTaskResponseSchema = z.object({ task: TaskSchema });
export type CompleteTaskResponse = z.infer<typeof CompleteTaskResponseSchema>;

export const ApiErrorCodeSchema = z.enum(["bad_request", "not_found"]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Uniform error envelope returned by every handler. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: ApiErrorCodeSchema,
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
