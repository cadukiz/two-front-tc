"use client";

/**
 * `PomodoroBox` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007).
 *
 * ADR-0008: this is a LOCAL render-mute control only. Start/stop and the
 * countdown change *nothing* server-side — no data, scheduler, EventSource or
 * reducer is paused. While active, the parent merely suppresses arrival
 * highlight animations + toast popups; the feeds keep updating underneath. The
 * banner makes the non-authoritative nature explicit. SVG ring transition
 * respects `prefers-reduced-motion`.
 */
import {
  POMODORO_DURATIONS,
  type PomodoroDuration,
} from "../_client/usePomodoro";

interface PomodoroBoxProps {
  active: boolean;
  remainingMs: number;
  durationMin: PomodoroDuration;
  totalMs: number;
  onStart: () => void;
  onStop: () => void;
  onSetDuration: (m: PomodoroDuration) => void;
}

const R = 60;
const C = 2 * Math.PI * R;

export function PomodoroBox({
  active,
  remainingMs,
  durationMin,
  totalMs,
  onStart,
  onStop,
  onSetDuration,
}: PomodoroBoxProps) {
  const pct = active ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 1;
  const offset = C * (1 - pct);

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(
    2,
    "0",
  );

  return (
    <div className="flex flex-col gap-3 px-[18px] pb-[18px] pt-[14px]">
      {active && (
        <div
          role="status"
          className="flex items-start gap-[9px] rounded-card border border-line bg-teal-50 px-[14px] py-[10px] text-[12px] leading-snug text-teal-900"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="mt-[1px] h-[14px] w-[14px] flex-none"
          >
            <rect x="3" y="3" width="3.5" height="10" rx="1" />
            <rect x="9.5" y="3" width="3.5" height="10" rx="1" />
          </svg>
          <span>
            <strong className="font-semibold">Focus mode active</strong> —
            notifications muted locally (still recorded; server unaffected).
            The feeds keep updating underneath.
          </span>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 py-1">
        <div className="relative grid h-[160px] w-[160px] place-items-center">
          <svg
            viewBox="0 0 132 132"
            className="h-full w-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke="rgba(15,93,74,0.12)"
              strokeWidth="8"
            />
            <circle
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke="#0E5C47"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </svg>
          <div
            className="absolute inset-0 grid place-items-center text-center"
            role="timer"
            aria-label="Pomodoro countdown"
          >
            <div>
              <div className="font-mono text-[30px] font-semibold tabular-nums text-ink-1">
                {active ? `${mm}:${ss}` : `${durationMin}:00`}
              </div>
              <div className="mt-[2px] text-[11px] uppercase tracking-[0.16em] text-ink-3">
                {active ? "focus · muted" : "ready"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {!active ? (
            <>
              {POMODORO_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={durationMin === m}
                  onClick={() => onSetDuration(m)}
                  className={`rounded-pill border px-3 py-[6px] text-[12.5px] font-medium transition-[background,color,border-color] duration-150 motion-reduce:transition-none ${
                    durationMin === m
                      ? "border-teal bg-teal text-panel"
                      : "border-line bg-card-alt text-ink-2 hover:border-teal hover:text-teal"
                  }`}
                >
                  {m}m
                </button>
              ))}
              <button
                type="button"
                onClick={onStart}
                className="rounded-pill border border-teal bg-teal px-4 py-[6px] text-[12.5px] font-semibold text-panel transition-all duration-150 hover:bg-teal-900 motion-reduce:transition-none"
              >
                Start
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="rounded-pill border border-rust bg-rust px-4 py-[6px] text-[12.5px] font-semibold text-panel transition-all duration-150 hover:opacity-90 motion-reduce:transition-none"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <p className="font-serif text-[12px] italic leading-snug text-ink-3">
        Focus mode mutes notification noise on this screen only (ADR-0008).
        Nothing pauses server-side — data keeps flowing and is fully recorded.
      </p>
    </div>
  );
}
