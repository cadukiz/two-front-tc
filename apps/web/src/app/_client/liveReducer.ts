/**
 * Pure SSE event reducer (ADR-0006). Extracted from `useLiveState` so the
 * reliability contract — snapshot seed, delta apply, `seq <= lastSeq` drop,
 * dedupe-by-id, newest-first-by-seq ordering — is unit-testable with zero
 * DOM / EventSource. The hook is a thin `EventSource` + `useReducer` wrapper
 * over this function.
 *
 * Types & schema come from `@twofront/domain` — never redefined here.
 */
import type {
  Task,
  Email,
  Sms,
  RuntimeConfig,
  SseEvent,
} from "@twofront/domain";

export interface LiveState {
  tasks: Task[];
  emails: Email[];
  sms: Sms[];
  /** Highest `seq` applied so far — the reconnect dedupe key (ADR-0006 D5). */
  lastSeq: number;
  /**
   * Server-authoritative runtime cadence config (ADR-0009 — the 3 user-facing
   * ints; `tickMs` is internal/test-only and never reaches the client). Seeded
   * by every snapshot and updated by `config.updated` SSE frames so the
   * sliders stay in sync across all clients. `null` only before the first
   * snapshot has seeded the state.
   */
  config: RuntimeConfig | null;
}

export const EMPTY_LIVE_STATE: LiveState = {
  tasks: [],
  emails: [],
  sms: [],
  lastSeq: 0,
  config: null,
};

/** Newest-first by `seq` (display ordering key — never `createdAt`). */
function sortBySeqDesc<T extends { seq: number }>(feed: readonly T[]): T[] {
  return [...feed].sort((a, b) => b.seq - a.seq);
}

/**
 * Upsert `record` into `feed`: replace any existing entry with the same `id`
 * (dedupe), then keep the feed newest-first by `seq`. A late duplicate with a
 * lower `seq` than the kept copy still can't reorder ahead of it.
 */
function upsert<T extends { id: string; seq: number }>(
  feed: readonly T[],
  record: T,
): T[] {
  const without = feed.filter((r) => r.id !== record.id);
  return sortBySeqDesc([record, ...without]);
}

/**
 * Apply one already-`SseEventSchema.parse`d event to the state.
 *
 *  - `snapshot` (re)seeds every feed + `lastSeq` (server is authoritative;
 *    a fresh snapshot replaces local state — handles reconnect).
 *  - Any delta with `seq <= lastSeq` is ignored (ADR-0006 D5 — no replay
 *    buffer; the snapshot already reflects it).
 *  - Deltas upsert by `id` (idempotent) and bump `lastSeq`.
 */
export function liveReducer(state: LiveState, event: SseEvent): LiveState {
  if (event.type === "snapshot") {
    const snap = event.data;
    return {
      tasks: sortBySeqDesc(snap.tasks),
      emails: sortBySeqDesc(snap.emails),
      sms: sortBySeqDesc(snap.sms),
      lastSeq: snap.lastSeq,
      // Authoritative runtime config — re-seeded with every snapshot
      // (ADR-0009); the client renders it and reconciles slider state to it.
      config: snap.config,
    };
  }

  // `config.updated` is last-write-wins, NOT an id-keyed feed record and not a
  // reconnect-dedupe concern: a re-seeding snapshot already carries the latest
  // config. Apply it without touching `lastSeq` or the `seq <= lastSeq` gate so
  // a client's optimistic slider value is reconciled to the server's truth
  // (ADR-0009), while the ordering contract for the feeds is unchanged.
  if (event.type === "config.updated") {
    return { ...state, config: event.data };
  }

  // Delta: drop anything already covered by the seeding snapshot.
  if (event.seq <= state.lastSeq) {
    return state;
  }

  const lastSeq = event.seq;

  switch (event.type) {
    case "task.created":
    case "task.completed":
      return { ...state, tasks: upsert(state.tasks, event.data), lastSeq };
    case "email.created":
      return { ...state, emails: upsert(state.emails, event.data), lastSeq };
    case "sms.created":
      return { ...state, sms: upsert(state.sms, event.data), lastSeq };
    default: {
      // Exhaustive: every SseEvent variant is handled above.
      const _never: never = event;
      return state;
    }
  }
}
