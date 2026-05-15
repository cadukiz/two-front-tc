/**
 * Wave 4 — `GET /api/stream` (the SSE endpoint, ADR-0002).
 *
 * Hands the request off to `openSseStream(getStore())`, which attaches the
 * store listener before serializing the snapshot-first frame, runs the
 * heartbeat, and (on first connect) starts the server-authoritative scheduler
 * via `ensureSchedulerStarted()`. This handler is pure HTTP wiring.
 *
 * `runtime = "nodejs"`: the store/scheduler rely on Node timers + the
 * `globalThis` singleton, so the edge runtime must not be used.
 */
import { getStore } from "../../../server/store";
import { openSseStream } from "../../../server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(openSseStream(getStore()), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
