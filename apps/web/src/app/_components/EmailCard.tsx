"use client";

/**
 * `EmailCard` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007). Domain `Email`
 * type from `@twofront/domain`; field map applied: design `items` →
 * `pendingTitles`, `timestamp` → `createdAt`, `headline` → `body`.
 *
 * B2 round-trip (brief / ADR-0002): for an `immediate` email whose referenced
 * task (`email.taskId`) is still pending, render a "Mark complete" action that
 * hits the **GET email-link adapter** `GET /api/tasks/${taskId}/complete` —
 * the exact path a real mail client would open. We deliberately do NOT
 * optimistically mutate: the completion reflects back through SSE
 * (server-authoritative); once the task is completed `taskStillPending`
 * becomes false and the action shows the done/disabled state.
 */
import { useState } from "react";
import type { Email } from "@twofront/domain";
import { IBolt, IDigest, ICheck, IChevron } from "../components/icons";
import { formatTime, formatDateTime } from "../lib/format";

interface EmailCardProps {
  email: Email;
  /** Arrival-highlight flag (Tailwind `animate-fresh`). */
  fresh: boolean;
  /** Derived in `Workbench` from the live tasks: is `email.taskId` pending? */
  taskStillPending: boolean;
  /** Surface an error toast if the GET round-trip fails. */
  onError: (message: string) => void;
}

export function EmailCard({
  email,
  fresh,
  taskStillPending,
  onError,
}: EmailCardProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [marking, setMarking] = useState<boolean>(false);
  const isImmediate = email.kind === "immediate";
  const showAction = isImmediate && email.taskId != null;

  const markComplete = async (taskId: string): Promise<void> => {
    setMarking(true);
    try {
      // The exact email-action link path (GET adapter) — not the POST API.
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "GET",
      });
      if (!res.ok) {
        onError("Could not complete task from email — server rejected it.");
      }
      // Success reflects back via SSE → `taskStillPending` flips to false.
    } catch {
      onError("Could not complete task from email — connection problem.");
    } finally {
      setMarking(false);
    }
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

          <div className="mt-2 text-[13.5px] leading-[1.5] text-ink-2">
            {isImmediate ? (
              <span>{email.body}</span>
            ) : email.pendingTitles && email.pendingTitles.length > 0 ? (
              <ul className="mt-[6px] flex list-none flex-col gap-[3px] p-0">
                {email.pendingTitles.slice(0, 5).map((t, i) => (
                  <li
                    key={i}
                    className="relative pl-[14px] text-[13px] text-ink-2 before:absolute before:left-0 before:top-[0.6em] before:h-px before:w-[6px] before:bg-tan-deep before:content-['']"
                  >
                    {t}
                  </li>
                ))}
                {email.pendingTitles.length > 5 && (
                  <li className="relative pl-[14px] text-[13px] italic text-ink-3">
                    &hellip;and {email.pendingTitles.length - 5} more
                  </li>
                )}
              </ul>
            ) : (
              <span className="italic text-ink-3">
                No pending tasks at this time.
              </span>
            )}
          </div>

          {showAction && email.taskId != null && (
            <div className="mt-3 flex gap-2">
              {taskStillPending ? (
                <button
                  type="button"
                  disabled={marking}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (email.taskId != null) {
                      void markComplete(email.taskId);
                    }
                  }}
                  className="inline-flex items-center gap-[6px] rounded-pill border border-teal bg-transparent px-3 py-[6px] text-[12.5px] font-medium text-teal transition-all duration-150 hover:bg-teal hover:text-panel disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none [&_svg]:h-3 [&_svg]:w-3"
                >
                  <ICheck /> Mark complete
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-default items-center gap-[6px] rounded-pill border border-[rgba(15,93,74,0.2)] bg-teal-50 px-3 py-[6px] text-[12.5px] font-medium text-teal [&_svg]:h-3 [&_svg]:w-3"
                >
                  <ICheck /> Completed
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
