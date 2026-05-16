"use client";

/**
 * `EmailCard` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007). Domain `Email`
 * type from `@twofront/domain`; field map applied: design `items` →
 * `email.pending` (`{id,title}[]`), `timestamp` → `createdAt`,
 * `headline` → `body`.
 *
 * B2 / ADR-0010 — **every** notification email is actionable, and the complete
 * action is visible WITHOUT expanding the card (matches the always-visible
 * `TaskRow` Complete pattern):
 *  - RC1: the complete affordance lives in the always-rendered (collapsed)
 *    layout. Expanding only reveals the body/detail — completing never
 *    requires an expand.
 *  - RC2: `immediate` → one "Mark complete" for `email.taskId`; `summary` →
 *    one per-entry control for EACH still-pending `email.pending` task. Each
 *    control hits the **GET email-link adapter** `GET /api/tasks/:id/complete`
 *    (the exact path a real mail client would open). We deliberately do NOT
 *    optimistically mutate: completion reflects back through SSE
 *    (server-authoritative) via the live `pendingTaskIds` prop — a control
 *    flips to the done/disabled "Completed" state only once its task leaves
 *    the pending set, so the round-trip is visibly validated.
 */
import { useState } from "react";
import type { Email } from "@twofront/domain";
import { IBolt, IDigest, ICheck, IChevron } from "../components/icons";
import { formatTime, formatDateTime } from "../lib/format";

interface EmailCardProps {
  email: Email;
  /** Arrival-highlight flag (Tailwind `animate-fresh`). */
  fresh: boolean;
  /**
   * Live, server-authoritative set of currently-pending task ids (derived in
   * `Workbench` from the live tasks). Drives every per-task done/pending state
   * — immediate (`email.taskId`) and each summary `email.pending` entry.
   */
  pendingTaskIds: ReadonlySet<string>;
  /** Surface an error toast if the GET round-trip fails. */
  onError: (message: string) => void;
}

export function EmailCard({
  email,
  fresh,
  pendingTaskIds,
  onError,
}: EmailCardProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const isImmediate = email.kind === "immediate";

  const markComplete = async (taskId: string): Promise<void> => {
    setMarkingId(taskId);
    try {
      // The exact email-action link path (GET adapter) — not the POST API.
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "GET",
      });
      if (!res.ok) {
        onError("Could not complete task from email — server rejected it.");
      }
      // Success reflects back via SSE → the id leaves `pendingTaskIds`.
    } catch {
      onError("Could not complete task from email — connection problem.");
    } finally {
      setMarkingId(null);
    }
  };

  /** One complete affordance for a single task (shared immediate + summary). */
  const TaskAction = ({
    taskId,
    label,
  }: {
    taskId: string;
    label: string;
  }): React.ReactElement => {
    const stillPending = pendingTaskIds.has(taskId);
    if (!stillPending) {
      return (
        <button
          type="button"
          disabled
          aria-label={`Completed: ${label}`}
          className="inline-flex flex-none cursor-default items-center gap-[6px] rounded-pill border border-[rgba(15,93,74,0.2)] bg-teal-50 px-3 py-[5px] text-[12px] font-medium text-teal [&_svg]:h-3 [&_svg]:w-3"
        >
          <ICheck /> Completed
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={markingId === taskId}
        aria-label={`Mark complete: ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          void markComplete(taskId);
        }}
        className="inline-flex flex-none items-center gap-[6px] rounded-pill border border-teal bg-transparent px-3 py-[5px] text-[12px] font-medium text-teal transition-all duration-150 hover:bg-teal hover:text-panel disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none [&_svg]:h-3 [&_svg]:w-3"
      >
        <ICheck /> Mark complete
      </button>
    );
  };

  return (
    <article
      className={`overflow-hidden rounded-card border bg-card transition-[box-shadow,transform,border-color] duration-150 hover:border-line hover:shadow-md motion-reduce:transition-none ${
        fresh
          ? "animate-fresh border-[rgba(15,93,74,0.3)] motion-reduce:animate-none"
          : "border-line-soft"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-[10px] bg-transparent px-[14px] py-3 text-left transition-[background] duration-150 hover:bg-card-alt motion-reduce:transition-none"
      >
        <span
          className={`inline-flex flex-none items-center gap-[5px] rounded-pill px-[9px] py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.08em] [&_svg]:h-[9px] [&_svg]:w-[9px] ${
            isImmediate
              ? "bg-teal text-panel"
              : "bg-tan text-[#6e5a26]"
          }`}
        >
          {isImmediate ? <IBolt /> : <IDigest />}
          {isImmediate ? "Immediate" : "Summary"}
        </span>
        <span className="min-w-0 truncate text-[14px] font-semibold text-ink-1">
          {email.subject}
        </span>
        <span
          className="flex-none text-[11.5px] text-ink-3"
          title={formatDateTime(email.createdAt)}
        >
          {formatTime(email.createdAt)}
        </span>
        <span
          aria-hidden="true"
          className={`grid h-[22px] w-[22px] place-items-center rounded-full text-ink-3 transition-[transform,color,background] duration-200 motion-reduce:transition-none [&_svg]:h-3 [&_svg]:w-3 ${
            open ? "rotate-180 bg-teal-50 text-teal" : ""
          }`}
        >
          <IChevron />
        </span>
      </button>

      {/* ALWAYS-VISIBLE action region (RC1): completing never requires an
          expand. `immediate` → one control for `email.taskId`; `summary` →
          one compact `{title} [Mark complete]` row per pending entry; empty
          summary → the "no pending tasks" empty state. */}
      <div className="border-t border-dashed border-line-soft px-[14px] py-[10px]">
        {isImmediate && email.taskId != null ? (
          <div className="flex items-center justify-end">
            <TaskAction taskId={email.taskId} label={email.subject} />
          </div>
        ) : !isImmediate && email.pending != null ? (
          email.pending.length > 0 ? (
            <ul
              className="flex list-none flex-col gap-[6px] p-0"
              aria-label="Pending tasks in this summary"
            >
              {email.pending.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-[13px] text-ink-2">
                    {p.title}
                  </span>
                  <TaskAction taskId={p.id} label={p.title} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[12.5px] italic text-ink-3">
              No pending tasks at this time.
            </span>
          )
        ) : null}
      </div>

      {open && (
        <div className="border-t border-dashed border-line-soft px-[14px] pb-[14px] pt-3">
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-teal-50 text-[11px] font-semibold text-teal">
              {isImmediate ? "Tk" : "Σ"}
            </span>
            <span className="truncate font-mono text-[11px]">
              notifications@twofront.app &rarr; you
            </span>
          </div>

          <div className="mt-2 whitespace-pre-line text-[13.5px] leading-[1.5] text-ink-2">
            {email.body}
          </div>
        </div>
      )}
    </article>
  );
}
