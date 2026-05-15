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
 * - Wave 9.3: drag handles are re-enabled for a CLIENT-ONLY, NON-PERSISTENT
 *   cosmetic reorder of the pending list (ADR-0008). Dragging changes nothing
 *   server-side and never persists; a refresh restores the server `seq` order.
 *   Drag wiring is optional — if the handlers are absent the row is inert
 *   (e.g. completed lists never reorder). Keyboard a11y: the handle is a
 *   focusable button that moves the row up/down with the arrow keys; the
 *   drop-edge indicator and lift use the `motion-reduce:` variant.
 */
import { useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { Task } from "@twofront/domain";
import { ICheck, IGrip } from "../components/icons";
import { relativeAge, formatDateTime } from "../lib/format";

type DropEdge = "before" | "after";

interface TaskRowProps {
  task: Task;
  /** Workbench clock (epoch ms, ticks every 1 s) — drives the live age. */
  now: number;
  /** True for ~the arrival-highlight window after this id first appears. */
  fresh: boolean;
  /** Surface an error toast if the complete POST fails. */
  onError: (message: string) => void;
  /** True while this row is the one being dragged (lift styling). */
  isDragging?: boolean;
  /** Which edge of this row a drop is currently targeting (indicator). */
  dropEdge?: DropEdge | null;
  /** Client-only drag start — passes this row's id. */
  onDragStart?: (id: string) => void;
  /** Hover during drag — passes this row's id + which half is targeted. */
  onDragOver?: (id: string, edge: DropEdge) => void;
  /** Drag left this row. */
  onDragLeave?: (id: string) => void;
  /** Dropped `fromId` onto this row. */
  onDrop?: (fromId: string, toId: string) => void;
  /** Drag ended (cleanup). */
  onDragEnd?: () => void;
  /** Keyboard reorder: move this row one slot toward the list top/bottom. */
  onMove?: (id: string, dir: "up" | "down") => void;
}

export function TaskRow({
  task,
  now,
  fresh,
  onError,
  isDragging = false,
  dropEdge = null,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMove,
}: TaskRowProps) {
  const [completing, setCompleting] = useState<boolean>(false);
  const draggable = onDragStart != null;

  const handleDragStart = (e: DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    onDragStart?.(task.id);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const edge: DropEdge =
      e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    onDragOver?.(task.id, edge);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!draggable) return;
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    if (fromId) onDrop?.(fromId, task.id);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!onMove) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onMove(task.id, "up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onMove(task.id, "down");
    }
  };

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
      } ${
        isDragging ? "opacity-60 ring-1 ring-teal/40" : ""
      } ${
        dropEdge === "before"
          ? "before:absolute before:inset-x-2 before:-top-[3px] before:h-[2px] before:rounded-full before:bg-teal before:content-['']"
          : ""
      } ${
        dropEdge === "after"
          ? "after:absolute after:inset-x-2 after:-bottom-[3px] after:h-[2px] after:rounded-full after:bg-teal after:content-['']"
          : ""
      } ${fresh ? "animate-fresh motion-reduce:animate-none" : ""}`}
      title={task.title}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragOver={draggable ? handleDragOver : undefined}
      onDragLeave={draggable ? () => onDragLeave?.(task.id) : undefined}
      onDrop={draggable ? handleDrop : undefined}
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
    >
      {draggable ? (
        <button
          type="button"
          onKeyDown={handleKeyDown}
          aria-label={`Reorder ${task.title} (local only — use arrow keys)`}
          title="Drag, or focus and use ↑/↓, to reorder (local & non-persistent)"
          className="grid cursor-grab select-none place-items-center self-stretch rounded-[6px] border-none bg-transparent text-ink-3 opacity-50 transition-opacity duration-150 hover:opacity-90 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal active:cursor-grabbing motion-reduce:transition-none [&_svg]:h-4 [&_svg]:w-3"
        >
          <IGrip />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="grid select-none place-items-center self-stretch rounded-[6px] text-ink-3 opacity-30 [&_svg]:h-4 [&_svg]:w-3"
        >
          <IGrip />
        </span>
      )}
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
