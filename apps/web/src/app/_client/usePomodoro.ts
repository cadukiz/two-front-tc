"use client";

/**
 * `usePomodoro` — a purely LOCAL, NON-AUTHORITATIVE guidance countdown
 * (ADR-0014, superseding the Pomodoro clauses of ADR-0008/ADR-0012).
 *
 * Honest semantics: this hook owns nothing but a UI countdown for the
 * Pomodoro widget. It does NOT touch `useLiveState`, the `liveReducer`, the
 * `EventSource`, the server scheduler, or any domain data — and, as of
 * ADR-0014, it is consumed by NOTHING outside the widget itself. Starting or
 * stopping a session is a complete no-op for the rest of the app: feeds,
 * arrival highlights and toasts all behave identically whether or not a
 * session is running. It is purely a guidance timer.
 *
 * The 1-second `setInterval` here is a pure display tick (like the header
 * clock) — it never seeds, schedules, or mutates data.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const POMODORO_DURATIONS = [15, 25, 50] as const;
export type PomodoroDuration = (typeof POMODORO_DURATIONS)[number];

export interface PomodoroState {
  /** True while a guidance session is running (drives the widget UI only). */
  active: boolean;
  /** Milliseconds left in the current session (0 when idle/elapsed). */
  remainingMs: number;
  /** Selected session length in minutes (idle-only setting). */
  durationMin: PomodoroDuration;
  /** Total session length in ms (for the progress ring). */
  totalMs: number;
  start: () => void;
  stop: () => void;
  setDuration: (m: PomodoroDuration) => void;
}

/** Pure helper: ms left given a fixed end instant and "now". */
export function remainingMsAt(endMs: number | null, now: number): number {
  if (endMs == null) return 0;
  return Math.max(0, endMs - now);
}

export function usePomodoro(): PomodoroState {
  const [durationMin, setDurationMin] = useState<PomodoroDuration>(25);
  const [endMs, setEndMs] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const totalMs = durationMin * 60_000;
  const active = endMs != null && endMs > now;
  const remainingMs = active ? remainingMsAt(endMs, now) : 0;

  // Display-only countdown tick (UI timer, NOT a data scheduler). Runs only
  // while a session is pending so it idles when nothing is active.
  const endRef = useRef<number | null>(endMs);
  useEffect(() => {
    endRef.current = endMs;
  }, [endMs]);

  useEffect(() => {
    if (endMs == null) return;
    const id = setInterval(() => {
      const e = endRef.current;
      setNow(Date.now());
      if (e != null && Date.now() >= e) {
        setEndMs(null); // session elapsed
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endMs]);

  const start = useCallback((): void => {
    setNow(Date.now());
    setEndMs(Date.now() + durationMin * 60_000);
  }, [durationMin]);

  const stop = useCallback((): void => {
    setEndMs(null);
  }, []);

  const setDuration = useCallback((m: PomodoroDuration): void => {
    // Duration is an idle-only setting; changing it never affects an
    // in-flight session or anything server-side.
    setDurationMin(m);
  }, []);

  return {
    active,
    remainingMs,
    durationMin,
    totalMs,
    start,
    stop,
    setDuration,
  };
}
