/**
 * Wave 3 — the SSE hub (ADR-0002, ADR-0006 D5/D6). Turns the store's pub/sub
 * into a `text/event-stream` body: a snapshot-first frame, then live deltas,
 * plus a wall-time heartbeat. The reliability contract:
 *
 *  - Attach the store listener BEFORE serializing the snapshot, so no event
 *    emitted in the gap between snapshot capture and subscribe is lost
 *    (client dedupes by `seq <= lastSeq`; no replay buffer — ADR-0006 D5).
 *  - A dead controller (closed stream) self-unsubscribes so it can't wedge the
 *    store (the store already isolates per-listener; this is belt-and-braces).
 *  - First connect starts the recurring cadence (ADR-0004 D3).
 *
 * Types come from `@twofront/domain`; nothing is redefined here.
 */
import { SseEventSchema, type SseEvent } from "@twofront/domain";
import type { Store } from "./store";
import { ensureSchedulerStarted } from "./scheduler";

/** Default heartbeat period — wall-time, independent of `tickMs`. */
const DEFAULT_HEARTBEAT_MS = 15_000;

/** Pure SSE frame serializer: `id:`/`event:`/`data:` lines + blank terminator. */
export function formatSseFrame(evt: SseEvent): string {
  return `id: ${evt.seq}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}

export interface OpenSseStreamOptions {
  /** Heartbeat period in wall-clock ms (default 15000). */
  heartbeatMs?: number;
  /** Injectable for deterministic tests; defaults to the global. */
  setInterval?: typeof setInterval;
  /** Injectable for deterministic tests; defaults to the global. */
  clearInterval?: typeof clearInterval;
}

export function openSseStream(
  store: Store,
  opts?: OpenSseStreamOptions,
): ReadableStream<Uint8Array> {
  // First connect starts the server-authoritative cadence (ADR-0004 D3).
  ensureSchedulerStarted();

  const heartbeatMs = opts?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const setIntervalFn = opts?.setInterval ?? setInterval;
  const clearIntervalFn = opts?.clearInterval ?? clearInterval;
  const encoder = new TextEncoder();

  let unsub: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cleanedUp = false;

  /** Idempotent: drop the store listener and stop the heartbeat. */
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsub?.();
    unsub = undefined;
    if (heartbeat !== undefined) {
      clearIntervalFn(heartbeat);
      heartbeat = undefined;
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      /** Enqueue a chunk; if the stream is closed, self-clean instead of wedging. */
      const safeEnqueue = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const onEvent = (e: SseEvent): void => {
        safeEnqueue(formatSseFrame(e));
      };

      // 1. Attach the listener FIRST — before the snapshot is built/serialized
      //    — so nothing emitted in the gap is lost (ADR-0006 D5).
      unsub = store.subscribe(onEvent);

      // 2. Snapshot-first frame. Validate defensively (fail loud on drift).
      const snap = store.snapshot();
      const snapEvt: SseEvent = {
        type: "snapshot",
        seq: snap.lastSeq,
        data: snap,
      };
      SseEventSchema.parse(snapEvt);
      safeEnqueue(formatSseFrame(snapEvt));

      // 4. Heartbeat: a `:\n\n` comment every `heartbeatMs` (wall-time).
      heartbeat = setIntervalFn(() => {
        safeEnqueue(":\n\n");
      }, heartbeatMs);
    },

    // 5. Client disconnect / reader.cancel() → release resources.
    cancel() {
      cleanup();
    },
  });
}
