/**
 * Wave 4 — shared response helpers (DRY across all five route handlers).
 *
 * Every handler returns either a domain-validated success body or the uniform
 * `ApiError` envelope. `handleError` is the single place that maps the store's
 * `ValidationError`/`NotFoundError` and Zod parse failures onto HTTP status
 * codes, so no route hand-rolls error shapes. Truly unexpected errors do NOT
 * get squeezed into `ApiErrorSchema` (its `code` enum has no "internal"); they
 * return a plain `{ error: "Internal error" }` 500 instead.
 *
 * Types/schemas come from `@twofront/domain`; nothing is redefined here.
 */
import { z } from "zod";
import { ApiErrorSchema, type ApiErrorCode } from "@twofront/domain";
import { NotFoundError, ValidationError } from "../../../server/errors";

/** `Response.json` wrapper (200 unless `init` overrides). */
export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** HTTP status for each `ApiErrorCode`. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
};

/** Build the uniform `ApiError` envelope with the matching HTTP status. */
export function apiError(code: ApiErrorCode, message: string): Response {
  return Response.json(ApiErrorSchema.parse({ error: message, code }), {
    status: STATUS_BY_CODE[code],
  });
}

/** Flatten a ZodError into a single human-readable message. */
function flattenZod(err: z.ZodError): string {
  const msg = err.issues
    .map((i) => {
      const path = i.path.join(".");
      return path.length > 0 ? `${path}: ${i.message}` : i.message;
    })
    .join("; ");
  return msg.length > 0 ? msg : "Invalid request.";
}

/**
 * Single error→Response mapping for every handler's try/catch:
 *  - `ValidationError`          → 400 `bad_request`
 *  - `ZodError`                 → 400 `bad_request` (flattened message)
 *  - `NotFoundError`            → 404 `not_found`
 *  - anything else (unexpected) → 500 `{ error: "Internal error" }`
 */
export function handleError(e: unknown): Response {
  if (e instanceof ValidationError) {
    return apiError("bad_request", e.message);
  }
  if (e instanceof z.ZodError) {
    return apiError("bad_request", flattenZod(e));
  }
  if (e instanceof NotFoundError) {
    return apiError("not_found", e.message);
  }
  return Response.json({ error: "Internal error" }, { status: 500 });
}
