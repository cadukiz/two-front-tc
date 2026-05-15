/**
 * Wave 4 — `POST /api/tasks`.
 *
 * Validates the body with the domain `CreateTaskRequestSchema`, then delegates
 * to the store. The store creates the immediate email synchronously and emits
 * the `task.created` / `email.created` SSE events (ADR-0004 D2) — this handler
 * does NOT duplicate that side-effecting work, it only does the HTTP wiring.
 *
 * Types/schemas come from `@twofront/domain`; nothing is redefined here.
 */
import {
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
} from "@twofront/domain";
import { getStore } from "../../../server/store";
import { ValidationError } from "../../../server/errors";
import { json, handleError } from "../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      // Malformed/absent JSON body → a 400, not a 500.
      throw new ValidationError("Request body must be valid JSON.");
    }

    const { title } = CreateTaskRequestSchema.parse(raw);
    const { task, email } = getStore().addTask(title);

    return json(CreateTaskResponseSchema.parse({ task, email }), {
      status: 201,
    });
  } catch (e) {
    return handleError(e);
  }
}
