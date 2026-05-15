"use client";

/**
 * Client container (ADR-0007 — Tailwind-only). Calls `useLiveState(initial)`
 * and renders the three ported `Panel`s in the design's three-panel
 * responsive layout (Tasks left; Emails + SMS stacked right; mobile-stacked;
 * each panel independently scrollable).
 *
 * Wave 6.2: the Tasks section (6.1) + the Emails section now use the rich
 * real-API-wired UI (`AddTaskBar` + `TaskRow` + `CompletedRow` + `EmailCard`
 * with the B2 complete-from-email round-trip). SMS keeps the Wave-5 inline
 * placeholder until Wave 6.3 swaps in `SmsBubble`. The server stays
 * authoritative — actions POST/GET and the result reflects back through SSE;
 * the only client-local state is the arrival-highlight set, the (client-only)
 * email filter, and transient error toasts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@twofront/domain";
import { useLiveState } from "./useLiveState";
import { useFreshIds } from "./useFreshIds";
import { AppHeader } from "../components/AppHeader";
import { Panel, Empty } from "../components/Panel";
import { IChecklist, IEnvelope, IFibonacci, IHand } from "../components/icons";
import { AddTaskBar } from "../_components/AddTaskBar";
import { TaskRow, CompletedRow } from "../_components/TaskRow";
import { EmailCard } from "../_components/EmailCard";
import { formatTime } from "../lib/format";

interface WorkbenchProps {
  initial: Snapshot;
}

interface ErrToast {
  id: string;
  text: string;
}

let toastSeq = 0;

export function Workbench({ initial }: WorkbenchProps) {
  const { tasks, emails, sms, connection } = useLiveState(initial);

  // Live ticking clock (client-only; avoids SSR hydration drift).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Transient error toasts (AddTaskBar / complete failures). The ported
  // `Toasts` component lands in Wave 6.3; for now a minimal inline host.
  const [toasts, setToasts] = useState<ErrToast[]>([]);
  const pushToast = useCallback((text: string): void => {
    toastSeq += 1;
    const id = `t${toastSeq}`;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const pending = useMemo(
    () => tasks.filter((t) => t.status === "pending"),
    [tasks],
  );
  const completed = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks],
  );
  const pendingIds = useMemo(
    () => new Set(pending.map((t) => t.id)),
    [pending],
  );

  // Arrival highlights (client-only CSS class; server authoritative).
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const emailIds = useMemo(() => emails.map((e) => e.id), [emails]);
  const freshTasks = useFreshIds(taskIds);
  const freshEmails = useFreshIds(emailIds);

  // Email type filter (client-only, retained from the design — harmless).
  const [emailFilter, setEmailFilter] = useState<
    "all" | "immediate" | "summary"
  >("all");
  const filteredEmails =
    emailFilter === "all"
      ? emails
      : emails.filter((e) => e.kind === emailFilter);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <AppHeader connection={connection} now={now} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[18px] px-[22px] pb-[22px] pt-[18px] max-[920px]:grid-cols-1 max-[920px]:auto-rows-[minmax(400px,auto)] max-[720px]:gap-[14px] max-[720px]:p-[14px]">
        {/* ---------------- Tasks ---------------- */}
        <Panel
          kind="tasks"
          title="My Tasks"
          count={pending.length}
          icon={<IChecklist />}
          meta={
            <>
              clipboard<span className="dot" />server-authoritative
            </>
          }
          clip
        >
          <AddTaskBar onError={pushToast} />

          <div
            className="px-[14px] pb-[18px] pt-[6px]"
            aria-live="polite"
            aria-label="Tasks"
          >
            <div className="flex items-baseline gap-[10px] px-2 pb-[10px] pt-[14px] font-serif text-[24px] italic leading-none tracking-[-0.012em] text-clip">
              <span>Pending</span>
              <span className="relative top-[2px] inline-grid h-[28px] min-w-[28px] place-items-center rounded-pill bg-[#3D423E] px-2 text-[12.5px] font-semibold not-italic text-[#FBF6E8]">
                {pending.length}
              </span>
            </div>
            {pending.length === 0 ? (
              <Empty>
                <span className="em">No pending tasks.</span>
                <br />
                Add one to see notifications fire.
              </Empty>
            ) : (
              <div className="relative mx-1 mb-[14px] mt-2 rounded-[6px] border border-[rgba(15,93,74,0.10)] bg-gradient-to-b from-[#FFFDF6] via-[#FFFFFF] to-[#FFFFFF] shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_2px_4px_rgba(15,93,74,0.08),0_14px_24px_-12px_rgba(15,93,74,0.22)]">
                <div className="relative px-[6px] pb-[10px] pt-3">
                  {pending.length > 1 && (
                    <div className="flex items-center gap-[9px] px-3 pb-3 pt-1 font-serif text-[15px] italic text-teal-900 opacity-90 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-teal [&_svg]:opacity-85">
                      <IHand /> drag any task to reorder &mdash; top is highest
                      priority
                    </div>
                  )}
                  {pending.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      now={now}
                      fresh={freshTasks.has(t.id)}
                      onError={pushToast}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-[18px] flex items-baseline gap-[10px] px-2 pb-[10px] pt-[14px] font-serif text-[24px] italic leading-none tracking-[-0.012em] text-clip">
              <span>Completed</span>
              <span className="relative top-[2px] inline-grid h-[28px] min-w-[28px] place-items-center rounded-pill bg-[#3D423E] px-2 text-[12.5px] font-semibold not-italic text-[#FBF6E8]">
                {completed.length}
              </span>
            </div>
            {completed.length === 0 ? (
              <Empty>Nothing completed yet.</Empty>
            ) : (
              <div className="relative mx-1 mb-[14px] mt-2 rounded-[6px] border border-[rgba(15,93,74,0.10)] bg-gradient-to-b from-[#FFFDF6] via-[#FFFFFF] to-[#FFFFFF] shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_2px_4px_rgba(15,93,74,0.08),0_14px_24px_-12px_rgba(15,93,74,0.22)]">
                <div className="relative py-2">
                  {completed.map((t) => (
                    <CompletedRow key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* ---------------- Right stack ---------------- */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-[18px] max-[720px]:gap-[14px]">
          {/* Emails */}
          <Panel
            kind="emails"
            title="Emails"
            count={emails.length}
            icon={<IEnvelope />}
            meta={
              <>
                newest first<span className="dot" />auto-stream
              </>
            }
          >
            <div className="flex items-center justify-between gap-[10px] px-4 pb-0 pt-[10px]">
              <div
                className="inline-flex gap-[2px] rounded-pill border border-line bg-card p-[3px] shadow-sm"
                role="tablist"
                aria-label="Filter emails by type"
              >
                {(
                  [
                    { id: "all", label: "All", count: emails.length },
                    {
                      id: "immediate",
                      label: "Immediate",
                      count: emails.filter((e) => e.kind === "immediate")
                        .length,
                    },
                    {
                      id: "summary",
                      label: "Summary",
                      count: emails.filter((e) => e.kind === "summary")
                        .length,
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={emailFilter === opt.id}
                    onClick={() => setEmailFilter(opt.id)}
                    className={`inline-flex items-center gap-[6px] rounded-pill px-3 py-[5px] text-[12px] font-medium transition-[background,color] duration-150 motion-reduce:transition-none ${
                      emailFilter === opt.id
                        ? "bg-teal text-panel"
                        : "text-ink-2 hover:text-teal"
                    }`}
                  >
                    {opt.label}
                    <span className="pl-[2px] text-[11px] opacity-75">
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
              {emailFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setEmailFilter("all")}
                  title="Clear filter"
                  className="cursor-pointer border-none bg-none font-serif text-[11.5px] italic text-ink-3"
                >
                  clear filter
                </button>
              )}
            </div>
            <div
              className="flex flex-col gap-[10px] px-4 pb-[18px] pt-3"
              aria-live="polite"
              aria-label="Emails"
            >
              {emails.length === 0 ? (
                <Empty>
                  <span className="em">No emails yet.</span>
                  <br />
                  Add a task to trigger the first one.
                </Empty>
              ) : filteredEmails.length === 0 ? (
                <Empty className="mt-1">
                  <span className="em">Nothing here.</span>
                  <br />
                  No {emailFilter} emails yet.
                </Empty>
              ) : (
                filteredEmails.map((e) => (
                  <EmailCard
                    key={e.id}
                    email={e}
                    fresh={freshEmails.has(e.id)}
                    taskStillPending={
                      e.taskId != null && pendingIds.has(e.taskId)
                    }
                    onError={pushToast}
                  />
                ))
              )}
            </div>
          </Panel>

          {/* SMS — Wave-5 placeholder until 6.3 swaps in SmsBubble */}
          <Panel
            kind="sms"
            title="SMS"
            count={sms.length}
            icon={<IFibonacci />}
            meta={
              <>
                Fibonacci<span className="dot" />+1 (415) 555
              </>
            }
          >
            <div
              className="flex flex-col gap-[10px] px-4 pb-[18px] pt-3"
              aria-live="polite"
              aria-label="SMS messages"
            >
              {sms.length === 0 ? (
                <Empty>
                  <span className="em">No messages yet.</span>
                  <br />
                  Reminders fire on a Fibonacci cadence.
                </Empty>
              ) : (
                sms.map((m) => (
                  <div key={m.id} className="flex flex-col items-start gap-1">
                    <div className="max-w-[92%] whitespace-pre-line rounded-[18px_18px_18px_6px] border border-line-soft bg-card px-[14px] py-3 text-[13.5px] leading-[1.5] text-ink-1 shadow-sm">
                      <div className="mb-[6px] flex items-center gap-2 font-mono text-[11px] text-ink-3 before:h-[6px] before:w-[6px] before:rounded-full before:bg-teal">
                        +1 (415) 555-TASK
                      </div>
                      {m.body}
                    </div>
                    <div className="pl-[14px] text-[11px] text-ink-3">
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Inline toast host (replaced by the ported `Toasts` in Wave 6.3). */}
      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto rounded-pill bg-rust px-4 py-[10px] text-[13px] text-panel shadow-lg animate-enter-top motion-reduce:animate-none"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
