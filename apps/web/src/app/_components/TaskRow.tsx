"use client";

/**
 * `TaskRow` (pending) + `CompletedRow` — ported `.jsx → .tsx`, Tailwind-only
 * (ADR-0007). Domain `Task` type from `@twofront/domain`; no parallel defs.
 *
 * - Age label live-ticks: `relativeAge(task.createdAt, now)` re-renders every
 *   second because `now` is the Workbench clock (1 s `setInterval`).
 * - Complete → `POST /api/tasks/:id/complete`; the completion reflects back
 *   through SSE (server-authoritative) — we do NOT optimistically mutate.
 * - Arrival highlight via the Tailwind `animate-fresh` token for fresh ids.
 * - Drag handlers are present but **inert** (real reorder = Wave 9): the
 *   handle is decorative and the row is not `draggable`.
 */
import { useState } from "react";
import type { Task } from "@twofront/domain";
import { ICheck, IGrip } from "../components/icons";
import { relativeAge, formatDateTime } from "../lib/format";

interface TaskRowProps {
  task: Task;
  /** Workbench clock (epoch ms, ticks every 1 s) — drives the live age. */
  now: number;
  /** True for ~the arrival-highlight window after this id first appears. */
  fresh: boolean;
  /** Surface an error toast if the complete POST fails. */
  onError: (message: string) => void;
}

export function TaskRow({ task, now, fresh, onError }: TaskRowProps) {
  const [completing, setCompleting] = useState<boolean>(false);

  const complete = async (): Promise<void> => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        onError("Could not complete task — the server rejected it.");
        setCompleting(false);
      }
      // On success the `task.completed` SSE frame moves it to Completed;
      // keep `completing` true so the row visibly settles until SSE swaps it.
    } catch {
      onError("Could not complete task — connection problem.");
      setCompleting(false);
    }
  };

  return (
    <div
      className={`relative mx-1 mb-2 ml-[6px] grid grid-cols-[22px_1fr_auto] items-center gap-[10px] rounded-row border px-[14px] py-3 pl-2 transition-[transform,box-shadow,background,border-color] duration-150 last:mb-1 motion-reduce:transition-none ${
        completing
          ? "border-[rgba(15,93,74,0.2)] bg-teal-50"
          : "border-[rgba(15,93,74,0.22)] bg-[rgba(255,253,244,0.35)] hover:-translate-y-px hover:border-[rgba(15,93,74,0.36)] hover:bg-[rgba(255,253,244,0.75)] hover:shadow-[0_2px_8px_-2px_rgba(15,93,74,0.16)]"
      } ${fresh ? "animate-fresh motion-reduce:animate-none" : ""}`}
      title={task.title}
    >
      <span
        aria-hidden="true"
        title="Drag to reorder (Wave 9)"
        className="grid select-none place-items-center self-stretch rounded-[6px] text-ink-3 opacity-30 [&_svg]:h-4 [&_svg]:w-3"
      >
        <IGrip />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-medium text-ink-1">
          {task.title}
        </div>
        <div className="mt-[3px] text-[12px] text-ink-3">
          <span
            title={formatDateTime(task.createdAt)}
            className="before:mr-[6px] before:mb-[2px] before:inline-block before:h-1 before:w-1 before:rounded-full before:bg-ink-4 before:align-middle before:content-['']"
          >
            {relativeAge(task.createdAt, now)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void complete()}
        disabled={completing}
        className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-pill border border-line bg-card-alt px-3 py-[6px] pl-[10px] text-[12.5px] font-medium text-ink-2 transition-all duration-150 hover:border-teal hover:bg-teal hover:text-panel disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none [&_svg]:h-[13px] [&_svg]:w-[13px]"
        aria-label={`Complete: ${task.title}`}
      >
        <ICheck /> Complete
      </button>
    </div>
  );
}

interface CompletedRowProps {
  task: Task;
}

export function CompletedRow({ task }: CompletedRowProps) {
  return (
    <div
      className="relative grid grid-cols-[1fr_auto] gap-x-3 px-[18px] py-3"
      title={task.title}
    >
      <div className="flex min-w-0 items-center">
        <span
          aria-hidden="true"
          className="mr-2 grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-teal [&_svg]:h-[11px] [&_svg]:w-[11px] [&_svg]:stroke-panel"
        >
          <ICheck />
        </span>
        <span className="truncate text-[14.5px] text-ink-3 line-through decoration-[rgba(14,92,71,0.7)] decoration-2">
          {task.title}
        </span>
      </div>
      <div className="text-right text-[12px] text-ink-3">
        {task.completedAt != null ? formatDateTime(task.completedAt) : ""}
      </div>
    </div>
  );
}
