"use client";

/**
 * Client container (ADR-0007 — Tailwind-only). Calls `useLiveState(initial)`
 * and renders the three ported `Panel`s in the design's three-panel
 * responsive layout (Tasks left; Emails + SMS stacked right; mobile-stacked;
 * each panel independently scrollable).
 *
 * Wave 6.3: all three sections are now the rich, real-API-wired UI
 * (`AddTaskBar` + `TaskRow` + `CompletedRow` + `EmailCard` + `SmsBubble`)
 * plus the ported `Toasts` host. The server stays authoritative — actions
 * POST/GET and the result reflects back through SSE; the only client-local
 * state is the arrival-highlight set, the (client-only) email filter, and
 * transient error toasts. Cross-cutting a11y: each feed region is
 * `aria-live="polite"`, animations respect `prefers-reduced-motion` via the
 * Tailwind `motion-reduce:` variant, and the `AppHeader` connection pill
 * reflects the live `useLiveState` connection state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RuntimeConfig, Snapshot } from "@twofront/domain";
import { useLiveState } from "./useLiveState";
import { useFreshIds } from "./useFreshIds";
import { AppHeader } from "../components/AppHeader";
import { Panel, Empty } from "../components/Panel";
import {
  IChecklist,
  IClock,
  IEnvelope,
  IFibonacci,
  IHand,
  ITomato,
} from "../components/icons";
import { AddTaskBar } from "../_components/AddTaskBar";
import { TaskRow, CompletedRow } from "../_components/TaskRow";
import { EmailCard } from "../_components/EmailCard";
import { SmsBubble } from "../_components/SmsBubble";
import { TimeControlsBox } from "../_components/TimeControlsBox";
import { PomodoroBox } from "../_components/PomodoroBox";
import { usePomodoro } from "./usePomodoro";
import {
  applyPendingOrder,
  prunePendingOrder,
  reorderPending,
  type PendingOrder,
} from "./pendingOrder";
import { Toasts } from "../_components/Toasts";
import type { Toast } from "../_components/Toasts";

const EMPTY_FRESH: ReadonlySet<string> = new Set<string>();

interface WorkbenchProps {
  initial: Snapshot;
}

let toastSeq = 0;

export function Workbench({ initial }: WorkbenchProps) {
  const { tasks, emails, sms, config, connection } = useLiveState(initial);

  // Live ticking clock (client-only; avoids SSR hydration drift).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pomodoro focus mode (ADR-0008): purely local render-mute. It pauses
  // NOTHING server-side — `useLiveState` / the reducer / EventSource keep
  // running and the feeds keep updating while `pomodoro.active`. We only
  // suppress the visual notification noise (arrival highlights + toasts).
  const pomodoro = usePomodoro();
  const muted = pomodoro.active;

  // Transient error toasts (AddTaskBar / complete failures).
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((text: string): void => {
    toastSeq += 1;
    const id = `t${toastSeq}`;
    setToasts((prev) => [...prev, { id, text, kind: "err" }]);
  }, []);
  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ADR-0009: the Time Controls sliders debounce into this single-field
  // `PATCH /api/config`. The server stays authoritative — the response (and
  // the broadcast `config.updated` SSE frame) reconcile every client's
  // optimistic value; this callback only does the HTTP round-trip and rethrows
  // so `TimeControlsBox` can surface a toast on failure.
  const patchConfig = useCallback(
    async (patch: Partial<RuntimeConfig>): Promise<void> => {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`PATCH /api/config failed: ${res.status}`);
      }
    },
    [],
  );

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

  // ---- Wave 9.3: client-only, NON-PERSISTENT drag prioritization (ADR-0008).
  // A local order overlay on the *pending* list only. The server's `seq` order
  // stays the truth — this never POSTs, never persists (refresh restores
  // `seq`), and leaves completed/emails/SMS strictly `seq`-driven. SSE updates
  // are never broken by it (the overlay is a pure function of live `pending`).
  const [pendingOrder, setPendingOrder] = useState<PendingOrder>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    edge: "before" | "after";
  } | null>(null);

  // Drop ids whose task left (completed/removed) so the order resets sensibly
  // and can't grow unbounded. Runs after SSE-driven `pending` changes.
  useEffect(() => {
    setPendingOrder((prev) => prunePendingOrder(prev, pending));
  }, [pending]);

  const displayedPending = useMemo(
    () => applyPendingOrder(pending, pendingOrder),
    [pending, pendingOrder],
  );

  const commitReorder = useCallback(
    (fromId: string, toId: string, edge: "before" | "after"): void => {
      setPendingOrder((prev) =>
        reorderPending(prev, pending, fromId, toId, edge),
      );
    },
    [pending],
  );

  const handleDragStart = useCallback((id: string): void => {
    setDragId(id);
  }, []);
  const handleDragOver = useCallback(
    (id: string, edge: "before" | "after"): void => {
      setDropTarget((prev) =>
        prev && prev.id === id && prev.edge === edge ? prev : { id, edge },
      );
    },
    [],
  );
  const handleDragLeave = useCallback((id: string): void => {
    setDropTarget((prev) => (prev && prev.id === id ? null : prev));
  }, []);
  const handleDrop = useCallback(
    (fromId: string, toId: string): void => {
      setDropTarget((prev) => {
        commitReorder(fromId, toId, prev?.edge ?? "before");
        return null;
      });
      setDragId(null);
    },
    [commitReorder],
  );
  const handleDragEnd = useCallback((): void => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  // Keyboard reorder: move a row one slot toward the list top/bottom in the
  // currently-displayed sequence (same overlay, non-persistent).
  const handleMove = useCallback(
    (id: string, dir: "up" | "down"): void => {
      const seqIds = applyPendingOrder(pending, pendingOrder).map(
        (t) => t.id,
      );
      const idx = seqIds.indexOf(id);
      if (idx === -1) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= seqIds.length) return;
      const neighbor = seqIds[swapIdx];
      if (neighbor === undefined) return;
      setPendingOrder((prev) =>
        reorderPending(
          prev,
          pending,
          id,
          neighbor,
          dir === "up" ? "before" : "after",
        ),
      );
    },
    [pending, pendingOrder],
  );

  // Arrival highlights (client-only CSS class; server authoritative).
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const emailIds = useMemo(() => emails.map((e) => e.id), [emails]);
  const smsIds = useMemo(() => sms.map((m) => m.id), [sms]);
  // These keep tracking arrivals truthfully (server-authoritative); focus mode
  // only *suppresses the highlight at render time* by presenting empty sets —
  // the feeds themselves are already updated underneath.
  const freshTasksReal = useFreshIds(taskIds);
  const freshEmailsReal = useFreshIds(emailIds);
  const freshSmsReal = useFreshIds(smsIds);
  const freshTasks = muted ? EMPTY_FRESH : freshTasksReal;
  const freshEmails = muted ? EMPTY_FRESH : freshEmailsReal;
  const freshSms = muted ? EMPTY_FRESH : freshSmsReal;

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
              clipboard
              <span
                aria-hidden="true"
                className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-[rgba(42,31,15,0.45)] align-middle"
              />
              server-authoritative
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
                      <span className="ml-[6px] not-italic text-[11px] uppercase tracking-[0.14em] text-ink-3">
                        local only · not saved
                      </span>
                    </div>
                  )}
                  {displayedPending.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      now={now}
                      fresh={freshTasks.has(t.id)}
                      onError={pushToast}
                      isDragging={dragId === t.id}
                      dropEdge={
                        dropTarget?.id === t.id ? dropTarget.edge : null
                      }
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      onMove={handleMove}
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
                newest first
                <span
                  aria-hidden="true"
                  className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-teal align-middle"
                />
                auto-stream
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

          {/* SMS + controls split (SMS left; Time-controls right) */}
          <div className="grid min-h-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-[18px] max-[920px]:grid-cols-1 max-[920px]:auto-rows-[minmax(280px,auto)] max-[720px]:gap-[14px]">
            <Panel
              kind="sms"
              title="SMS"
              count={sms.length}
              icon={<IFibonacci />}
              meta={
                <>
                  Fibonacci
                  <span
                    aria-hidden="true"
                    className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-teal align-middle"
                  />
                  +1 (415) 555
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
                    <SmsBubble
                      key={m.id}
                      msg={m}
                      fresh={freshSms.has(m.id)}
                    />
                  ))
                )}
              </div>
            </Panel>

            {/* Controls column */}
            <div className="grid min-h-0 auto-rows-min gap-[18px] max-[720px]:gap-[14px]">
              <Panel
                kind="pomodoro"
                title="Pomodoro"
                icon={<ITomato size={24} />}
                meta={
                  <>
                    focus
                    <span
                      aria-hidden="true"
                      className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-teal align-middle"
                    />
                    mute locally
                  </>
                }
              >
                <PomodoroBox
                  active={pomodoro.active}
                  remainingMs={pomodoro.remainingMs}
                  durationMin={pomodoro.durationMin}
                  totalMs={pomodoro.totalMs}
                  onStart={pomodoro.start}
                  onStop={pomodoro.stop}
                  onSetDuration={pomodoro.setDuration}
                />
              </Panel>
              <Panel
                kind="time-controls"
                title="Time controls"
                icon={<IClock />}
                meta={
                  <>
                    cadence
                    <span
                      aria-hidden="true"
                      className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-teal align-middle"
                    />
                    all clients
                  </>
                }
              >
                <TimeControlsBox
                  config={config}
                  onPatch={patchConfig}
                  onError={pushToast}
                />
              </Panel>
            </div>
          </div>
        </div>
      </div>

      {/* Focus mode suppresses toast popups (the queue is untouched — nothing
          is lost; the server is unaffected). They resume when focus ends. */}
      <Toasts items={muted ? [] : toasts} onDismiss={dismissToast} />
    </div>
  );
}
