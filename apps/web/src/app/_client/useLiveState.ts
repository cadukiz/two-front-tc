"use client";

/**
 * `useLiveState` — the live data layer (ADR-0002 / ADR-0006). Opens
 * `GET /api/stream` via `EventSource`, validates every frame against
 * `SseEventSchema` (dropping invalid ones), and folds them through the pure
 * `liveReducer`. The server is authoritative — there is no client mock and no
 * client scheduler (those were deleted from the design port).
 *
 * SSR seeding: `page.tsx` passes the store snapshot so the first paint is
 * already real data; the `EventSource` then takes over (its `snapshot` frame
 * harmlessly re-seeds, and `seq <= lastSeq` dedupe covers the gap).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import {
  SseEventSchema,
  SSE_EVENT_TYPES,
  type Config,
  type Snapshot,
  type SseEvent,
} from "@twofront/domain";
import { liveReducer, type LiveState } from "./liveReducer";
import type { Connection } from "../components/AppHeader";

const STREAM_URL = "/api/stream";

function seedFromSnapshot(snapshot: Snapshot): LiveState {
  return liveReducer(
    { tasks: [], emails: [], sms: [], lastSeq: 0, config: null },
    { type: "snapshot", seq: snapshot.lastSeq, data: snapshot },
  );
}

export interface LiveStateResult {
  tasks: LiveState["tasks"];
  emails: LiveState["emails"];
  sms: LiveState["sms"];
  /**
   * Authoritative server config (read-only display, ADR-0008). Seeded from the
   * SSR snapshot so it is non-null from the first paint.
   */
  config: Config;
  connection: Connection;
}

export function useLiveState(initial: Snapshot): LiveStateResult {
  const [state, dispatch] = useReducer(
    liveReducer,
    initial,
    seedFromSnapshot,
  );
  const [connection, setConnection] = useState<Connection>("connecting");
  // Once we've been "live" at least once, an error is a *reconnect*, not the
  // initial connect attempt.
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const es = new EventSource(STREAM_URL);

    es.onopen = (): void => {
      hasConnectedRef.current = true;
      setConnection("live");
    };

    es.onerror = (): void => {
      // EventSource auto-reconnects; surface the transient state.
      setConnection(
        hasConnectedRef.current ? "reconnecting" : "connecting",
      );
    };

    const handle = (raw: MessageEvent): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data as string);
      } catch {
        return; // malformed frame — drop it
      }
      const result = SseEventSchema.safeParse(parsed);
      if (!result.success) return; // invalid against the contract — drop it
      dispatch(result.data satisfies SseEvent);
    };

    // The server names each frame with `event: <type>`; a generic
    // `onmessage` would only catch unnamed frames, so attach per type.
    for (const type of SSE_EVENT_TYPES) {
      es.addEventListener(type, handle as EventListener);
    }

    return (): void => {
      for (const type of SSE_EVENT_TYPES) {
        es.removeEventListener(type, handle as EventListener);
      }
      es.close();
    };
  }, []);

  return {
    tasks: state.tasks,
    emails: state.emails,
    sms: state.sms,
    // Seeded from `initial` on first render, then re-seeded by every snapshot;
    // the `?? initial.config` keeps the contract non-null without a non-null `!`.
    config: state.config ?? initial.config,
    connection,
  };
}
