"use client";

/**
 * Client container (ADR-0007 — Tailwind-only). Calls `useLiveState(initial)`
 * and renders the three ported `Panel`s in the design's three-panel
 * responsive layout (Tasks left; Emails + SMS stacked right; mobile-stacked;
 * each panel independently scrollable).
 *
 * Wave 6.1: the Tasks section is now the rich, real-API-wired UI
 * (`AddTaskBar` + `TaskRow` + `CompletedRow`). Emails / SMS keep the Wave-5
 * inline placeholder rows until Waves 6.2 / 6.3 swap in `EmailCard` /
 * `SmsBubble`. The server stays authoritative — actions POST and the result
 * reflects back through SSE; the only client-local state is the
 * arrival-highlight set and transient error toasts.
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

  // Arrival highlights (client-only CSS class; server authoritative).
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const freshTasks = useFreshIds(taskIds);

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
          {/* Emails — Wave-5 placeholder until 6.2 swaps in EmailCard */}
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
              ) : (
                emails.map((e) => (
                  <article
                    key={e.id}
                    className="overflow-hidden rounded-card border border-line-soft bg-card"
                  >
                    <div className="flex items-center gap-[10px] px-[14px] py-3">
                      <span
                        className={`flex-none rounded-pill px-[9px] py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                          e.kind === "immediate"
                            ? "bg-teal text-panel"
                            : "bg-tan text-[#6e5a26]"
                        }`}
                      >
                        {e.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-1">
                        {e.subject}
                      </span>
                      <span className="flex-none text-[11.5px] text-ink-3">
                        {formatTime(e.createdAt)}
                      </span>
                    </div>
                    <p className="border-t border-dashed border-line-soft px-[14px] pb-[14px] pt-3 text-[13.5px] leading-[1.5] text-ink-2">
                      {e.body}
                    </p>
                  </article>
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
