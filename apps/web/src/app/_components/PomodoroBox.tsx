"use client";

/**
 * `PomodoroBox` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007).
 *
 * ADR-0014: this is a FULLY DECOUPLED, standalone local guidance timer. It
 * affects NOTHING — no suppression of any notification surface, no banner,
 * no coupling copy. Start/stop and the countdown change nothing server-side
 * and nothing client-side outside this widget; the feeds, arrival highlights
 * and toasts behave identically regardless. UX trim per
 * ADR-0014: the countdown ring is shrunk (~62.5% of the prior diameter:
 * 100px container vs. the previous 160px) and the descriptive sub-text /
 * caption under the time is removed. SVG ring transition respects
 * `prefers-reduced-motion`.
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

// ADR-0014 ring shrink: prior visible ring lived in a 160px box (r=60 in a
// 132 viewBox). The widget is now ~62.5% of that — a 100px box, r=38 in a
// 100 viewBox — a small, tasteful guidance dial that sits comfortably in its
// panel rather than dominating it.
const R = 38;
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
      <div className="flex flex-col items-center gap-4 py-1">
        <div className="relative grid h-[100px] w-[100px] place-items-center">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="rgba(15,93,74,0.12)"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="#0E5C47"
              strokeWidth="6"
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
            <div className="font-mono text-[19px] font-semibold tabular-nums text-ink-1">
              {active ? `${mm}:${ss}` : `${durationMin}:00`}
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
    </div>
  );
}
