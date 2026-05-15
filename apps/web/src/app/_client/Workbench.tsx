"use client";

/**
 * Client container (ADR-0007 — Tailwind-only). Calls `useLiveState(initial)`
 * and renders the three ported `Panel`s in the design's three-panel
 * responsive layout (Tasks left; Emails + SMS stacked right; mobile-stacked;
 * each panel independently scrollable).
 *
 * Wave 5 scope: real live data through minimal placeholder rows so the shell
 * is genuinely wired, NOT a mock. Rich `TaskRow` / `EmailCard` / `SmsBubble`
 * + add/complete actions land in Wave 6.
 */
import { useEffect, useState } from "react";
import type { Snapshot } from "@twofront/domain";
import { useLiveState } from "./useLiveState";
import { AppHeader } from "../components/AppHeader";
import { Panel, Empty } from "../components/Panel";
import { IChecklist, IEnvelope, IFibonacci } from "../components/icons";
import { relativeAge, formatTime } from "../lib/format";

interface WorkbenchProps {
  initial: Snapshot;
}

export function Workbench({ initial }: WorkbenchProps) {
  const { tasks, emails, sms, connection } = useLiveState(initial);

  // Live ticking clock (client-only; avoids SSR hydration drift).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed");

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
          <div className="px-[14px] pb-[18px] pt-[6px]">
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
              <ul className="flex flex-col gap-2">
                {pending.map((t) => (
                  <li
                    key={t.id}
                    title={t.title}
                    className="flex items-center justify-between gap-[10px] rounded-row border border-[rgba(15,93,74,0.22)] bg-[rgba(255,253,244,0.35)] px-[14px] py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink-1">
                      {t.title}
                    </span>
                    <span className="flex-none text-[12px] text-ink-3">
                      {relativeAge(t.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
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
              <ul className="flex flex-col">
                {completed.map((t) => (
                  <li
                    key={t.id}
                    title={t.title}
                    className="flex items-center justify-between gap-3 px-[18px] py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-3 line-through decoration-[rgba(14,92,71,0.7)] decoration-2">
                      {t.title}
                    </span>
                    <span className="flex-none text-[12px] text-ink-3">
                      {t.completedAt != null
                        ? formatTime(t.completedAt)
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
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
            <div className="flex flex-col gap-[10px] px-4 pb-[18px] pt-3">
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

          {/* SMS */}
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
            <div className="flex flex-col gap-[10px] px-4 pb-[18px] pt-3">
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
    </div>
  );
}
