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
import { useIsDesktop } from "./useIsDesktop";
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
import { Splitter } from "../_components/Splitter";

interface WorkbenchProps {
  initial: Snapshot;
}

let toastSeq = 0;

export function Workbench({ initial }: WorkbenchProps) {
  const { tasks, emails, sms, config, connection } = useLiveState(initial);

  // Wave 13 (ADR-0013): pick the layout arrangement. Exactly one of the
  // desktop Splitter tree / the narrow stacked fallback is mounted — never
  // both — so interactive elements + aria regions are never duplicated.
  const isDesktop = useIsDesktop();

  // Live ticking clock (client-only; avoids SSR hydration drift). This 1-second
  // `setInterval` is the ONLY client cadence and exists solely to advance the
  // live task-age label in `TaskRow` — the app is otherwise SSE-driven (NO
  // polling; the server stays authoritative). A `now` tick re-renders this
  // container, but the memoized feed cards (`EmailCard`, `SmsBubble`) must NOT
  // re-render from it: every prop they receive is referentially stable across
  // a tick (the email/sms objects, the memoized `pendingIds` set, the
  // `useCallback` `pushToast`/`onError` — all derived from SSE state, never
  // from `now`). `TaskRow` legitimately re-renders each second (it needs
  // `now`); that is the live-age element, not the blinking one.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pomodoro (ADR-0014): a FULLY DECOUPLED, standalone local guidance
  // countdown. It is consumed by NOTHING here — no derived suppression flag,
  // no `EMPTY_FRESH` swap, no emptied `Toasts`, no banner. Starting/stopping a
  // session is a complete no-op for feeds, arrival highlights and toasts; the
  // widget owns only its own UI. (Supersedes the Pomodoro coupling clauses
  // of ADR-0008 / ADR-0012.)
  const pomodoro = usePomodoro();

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
  // ADR-0014: these are ALWAYS the real fresh sets — Pomodoro no longer
  // swaps in an empty set. The highlight tracks arrivals truthfully
  // regardless of any Pomodoro session.
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const emailIds = useMemo(() => emails.map((e) => e.id), [emails]);
  const smsIds = useMemo(() => sms.map((m) => m.id), [sms]);
  const freshTasks = useFreshIds(taskIds);
  const freshEmails = useFreshIds(emailIds);
  const freshSms = useFreshIds(smsIds);

  // Email type filter (client-only, retained from the design — harmless).
  const [emailFilter, setEmailFilter] = useState<
    "all" | "immediate" | "summary"
  >("all");
  const filteredEmails =
    emailFilter === "all"
      ? emails
      : emails.filter((e) => e.kind === emailFilter);

  // ---- Wave 13 (ADR-0013): each panel's content is built once here, then
  // composed BOTH into the desktop resizable `Splitter` tree and the
  // narrow-screen stacked fallback. Content/props/behaviour are byte-identical
  // between the two arrangements — only the *containment/layout* differs.
  const tasksPanel = (
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
  );

  const emailsPanel = (
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
                    pendingTaskIds={pendingIds}
                    onError={pushToast}
                  />
                ))
              )}
            </div>
          </Panel>
  );

  const smsPanel = (
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
  );

  const pomodoroPanel = (
              <Panel
                kind="pomodoro"
                title="Pomodoro"
                icon={<ITomato size={24} />}
                meta={
                  <>
                    timer
                    <span
                      aria-hidden="true"
                      className="mx-[8px] mb-px inline-block h-[5px] w-[5px] rounded-full bg-teal align-middle"
                    />
                    local guide
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
  );

  const timeControlsPanel = (
              <Panel
                kind="time-controls"
                title="Time controls"
                icon={<IClock />}
              >
                <TimeControlsBox
                  config={config}
                  onPatch={patchConfig}
                  onError={pushToast}
                />
              </Panel>
  );

  return (
    // ADR-0013 rule 2 — `min-h-0` on every link of the layout chain so flex
    // children can shrink below their content (the body is already
    // `h-screen overflow-hidden` — rule 1). `flex-1 min-h-0` makes the layout
    // area exactly fill the space under the (flex-none) header; nothing
    // overflows the viewport — each feed scrolls inside its own Panel.
    //
    // EXACTLY ONE arrangement is mounted (never both): a CSS `hidden`/`lg:`
    // switch would leave both subtrees in the DOM, duplicating every
    // interactive element / aria region. `useIsDesktop` (matchMedia) picks
    // one; SSR/first paint = desktop, deterministic (no hydration drift).
    <div className="flex h-screen min-h-0 flex-col">
      <AppHeader connection={connection} now={now} />

      {isDesktop ? (
        /*
          Desktop (≥ lg / 1024px): the resizable Splitter tree. Every divider
          is drag-resizable at any nesting depth; double-click a handle resets
          that pair. Composition preserves the established hierarchy — Tasks
          prominent on the left; the right side stacks Emails over (SMS + the
          Pomodoro/Time-controls column).
        */
        <div className="min-h-0 min-w-0 flex-1 px-[22px] pb-[22px] pt-[18px]">
          <Splitter
            direction="row"
            initialSizes={[1.15, 1]}
            minPx={[360, 360]}
          >
            {tasksPanel}
            <Splitter direction="col" initialSizes={[1, 1]} minPx={[200, 220]}>
              {emailsPanel}
              <Splitter
                direction="row"
                initialSizes={[1.4, 1]}
                minPx={[260, 240]}
              >
                {smsPanel}
                <Splitter
                  direction="col"
                  initialSizes={[1, 1]}
                  minPx={[170, 170]}
                >
                  {pomodoroPanel}
                  {timeControlsPanel}
                </Splitter>
              </Splitter>
            </Splitter>
          </Splitter>
        </div>
      ) : (
        /*
          Small-screen fallback (< lg). The drag-resize spec is
          desktop-oriented and the Splitter `minPx` clamps make 5 panes
          un-fittable on a phone, so below the breakpoint we drop the Splitter
          entirely and stack all five panels vertically. The stack is the
          page's ONE scroll region (`overflow-y-auto`, the body stays
          `overflow-hidden`); each panel keeps a sensible min-height so every
          section stays reachable — the brief's "all sections visible /
          reachable" intent is preserved on mobile.
        */
        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-[14px]">
          <div className="min-h-[440px] shrink-0">{tasksPanel}</div>
          <div className="min-h-[340px] shrink-0">{emailsPanel}</div>
          <div className="min-h-[300px] shrink-0">{smsPanel}</div>
          <div className="min-h-[260px] shrink-0">{pomodoroPanel}</div>
          <div className="min-h-[240px] shrink-0">{timeControlsPanel}</div>
        </div>
      )}

      {/* ADR-0014: Toasts always receive the real queue — Pomodoro no longer
          empties or suppresses them. */}
      <Toasts items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
