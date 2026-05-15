/**
 * Pure SSE event reducer (ADR-0006). Extracted from `useLiveState` so the
 * reliability contract — snapshot seed, delta apply, `seq <= lastSeq` drop,
 * dedupe-by-id, newest-first-by-seq ordering — is unit-testable with zero
 * DOM / EventSource. The hook is a thin `EventSource` + `useReducer` wrapper
 * over this function.
 *
 * Types & schema come from `@twofront/domain` — never redefined here.
 */
import type { Task, Email, Sms, Config, SseEvent } from "@twofront/domain";

export interface LiveState {
  tasks: Task[];
  emails: Email[];
  sms: Sms[];
  /** Highest `seq` applied so far — the reconnect dedupe key (ADR-0006 D5). */
  lastSeq: number;
  /**
   * Server-resolved runtime config (ADR-0004/0005), carried straight from the
   * authoritative snapshot. Env-driven and read-only on the client — the
   * time-controls panel renders it but can never mutate it (ADR-0008). `null`
   * only before the first snapshot has seeded the state.
   */
  config: Config | null;
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
      // Authoritative, env-driven config — re-seeded with every snapshot
      // (it never changes at runtime, ADR-0004/0005); the client only reads it.
      config: snap.config,
    };
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
