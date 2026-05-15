/**
 * Domain-level errors thrown by the store. Route handlers map these to the
 * `ApiError` envelope (`not_found` / `bad_request`) in a later wave.
 */

/** Entity lookup failed (e.g. completing an unknown task id). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Input failed a domain schema rule (e.g. empty task title). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
