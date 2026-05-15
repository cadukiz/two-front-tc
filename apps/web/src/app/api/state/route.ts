/**
 * Wave 4 — `GET /api/state`.
 *
 * Returns the store's full snapshot (already `SnapshotSchema`-validated inside
 * the store). Used for the initial load / SSE-less fallback. Always dynamic so
 * Next never caches a stale snapshot.
 *
 * Types come from `@twofront/domain`; nothing is redefined here.
 */
import { getStore } from "../../../server/store";
import { json, handleError } from "../_lib/respond";

export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    return json(getStore().snapshot());
  } catch (e) {
    return handleError(e);
  }
}
