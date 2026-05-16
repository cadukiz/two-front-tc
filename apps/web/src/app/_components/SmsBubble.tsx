"use client";

/**
 * `SmsBubble` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007). Domain `Sms`
 * type from `@twofront/domain`; field map applied: design `headline` → `body`,
 * `items` → `pendingTitles`, `timestamp` → `createdAt`.
 *
 * The design's wall-clock "next in ~Ns" countdown is dropped: the cadence is
 * server-authoritative (no client scheduler — ADR-0002/0004). Instead the
 * meta line shows `formatDateTime(createdAt)` plus an informational Fibonacci
 * caption derived from the contract fields `fibIndex` / `fibMinute`.
 */
import { memo } from "react";
import type { Sms } from "@twofront/domain";
import { formatDateTime } from "../lib/format";

interface SmsBubbleProps {
  msg: Sms;
  /** Arrival-highlight flag (Tailwind `animate-fresh-bubble`). */
  fresh: boolean;
}

// SSE-driven, no polling: an `SmsBubble` only changes when its `msg`/`fresh`
// props change. `memo` so the Workbench's 1-second `now` clock (for the live
// task age elsewhere) never re-renders the SMS feed — props here never derive
// from `now`, so a tick is a strict no-op.
function SmsBubbleImpl({ msg, fresh }: SmsBubbleProps) {
  const hasTitles = msg.pendingTitles.length > 0;

  return (
    <div className="mb-[6px] flex flex-col items-start gap-1">
      <div
        className={`relative max-w-[92%] rounded-[18px_18px_18px_6px] border bg-card px-[14px] py-3 text-[13.5px] leading-[1.5] text-ink-1 shadow-sm ${
          fresh
            ? "animate-fresh-bubble border-[rgba(15,93,74,0.3)] motion-reduce:animate-none"
            : "border-line-soft"
        }`}
      >
        <div className="mb-[6px] flex items-center gap-2 font-mono text-[11px] text-ink-3 before:h-[6px] before:w-[6px] before:rounded-full before:bg-teal before:content-['']">
          +1 (415) 555-TASK
        </div>
        {hasTitles ? (
          <>
            <div>{msg.body}</div>
            <ul className="mt-[6px] flex list-none flex-col gap-[2px] p-0">
              {msg.pendingTitles.slice(0, 4).map((t, i) => (
                <li
                  key={i}
                  className="relative pl-[12px] text-[13px] text-ink-2 before:absolute before:left-1 before:text-teal before:content-['·']"
                >
                  {t}
                </li>
              ))}
              {msg.pendingTitles.length > 4 && (
                <li className="relative pl-[12px] text-[13px] text-ink-2 before:absolute before:left-1 before:text-teal before:content-['·']">
                  &hellip;+{msg.pendingTitles.length - 4} more
                </li>
              )}
            </ul>
          </>
        ) : (
          <div>{msg.body}</div>
        )}
      </div>
      <div className="flex items-center gap-2 pl-[14px] text-[11px] text-ink-3">
        <span title={formatDateTime(msg.createdAt)}>
          {formatDateTime(msg.createdAt)}
        </span>
        <span className="font-serif text-[12.5px] italic text-teal">
          Fibonacci #{msg.fibIndex} - Next message in {msg.fibMinute}m
        </span>
      </div>
    </div>
  );
}

/** Memoized — see the note above `SmsBubbleImpl` (SSE-driven; no `now`). */
export const SmsBubble = memo(SmsBubbleImpl);
