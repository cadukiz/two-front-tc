/**
 * Wave 10 — `/api/config` (ADR-0009).
 *
 *  - `GET`   → the current user-facing `RuntimeConfig` (the 3 cadence ints).
 *  - `PATCH` → validate a `PatchConfigRequest` (any non-empty subset, each
 *    range-checked), apply it via `store.setRuntimeConfig(...)`. The store
 *    synchronously invokes the scheduler's `recomputeFromConfig()` (registered
 *    by `ensureSchedulerStarted`) and then broadcasts a `config.updated` SSE
 *    frame; this handler only does the HTTP wiring + responds the full new
 *    `RuntimeConfig`. Invalid / empty / out-of-range bodies → 400 `bad_request`.
 *
 * `ensureSchedulerStarted()` is called first so the scheduler exists and its
 * recompute hook is wired even if a client PATCHes before any SSE connect.
 *
 * Types/schemas come from `@twofront/domain`; nothing is redefined here.
 */
import {
  PatchConfigRequestSchema,
  RuntimeConfigSchema,
} from "@twofront/domain";
import { getStore } from "../../../server/store";
import { ensureSchedulerStarted } from "../../../server/scheduler";
import { ValidationError } from "../../../server/errors";
import { json, handleError } from "../_lib/respond";

export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return json(RuntimeConfigSchema.parse(getStore().getRuntimeConfig()));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      // Malformed/absent JSON body → a 400, not a 500.
      throw new ValidationError("Request body must be valid JSON.");
    }

    // Empty / unknown-only / out-of-range → ZodError → 400 bad_request.
    const patch = PatchConfigRequestSchema.parse(raw);

    // The scheduler must exist + be wired as the config-change handler before
    // the mutation so `recomputeFromConfig()` fires even on a pre-SSE PATCH.
    ensureSchedulerStarted();

    const next = getStore().setRuntimeConfig(patch);
    return json(RuntimeConfigSchema.parse(next), { status: 200 });
  } catch (e) {
    return handleError(e);
  }
}
