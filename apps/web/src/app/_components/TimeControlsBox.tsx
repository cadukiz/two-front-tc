"use client";

/**
 * `TimeControlsBox` — Wave 10, Tailwind-only (ADR-0007). ADR-0009 reverses
 * ADR-0008: the Time Controls are now **interactive** and speak **real time
 * only** — there is NO "simulated minute" / `tickMs` row (that lever is
 * internal/test-only and removed from the UI entirely).
 *
 * Three integer sliders bound to the live, server-authoritative `RuntimeConfig`:
 *  - Email summary every — 1–100 min
 *  - SMS · Fibonacci pace base — 1–100 min
 *  - SMS · reset Fibonacci pace after — 1–100 days
 *
 * Each slider is optimistic locally and debounced (~300 ms) → `onPatch` (a
 * single-field `PATCH /api/config`). The server broadcasts `config.updated`
 * over SSE; when the new authoritative `config` prop arrives the sliders snap
 * to it (server-authoritative across all clients). A failed PATCH calls
 * `onError` (toast). Slider visuals are ported from the design source as
 * Tailwind utilities (4 px track, round teal thumb), not bespoke CSS.
 *
 * Types come from `@twofront/domain` (no parallel def).
 */
import { useEffect, useRef, useState } from "react";
import type { RuntimeConfig } from "@twofront/domain";

const DEBOUNCE_MS = 300;

interface TimeControlsBoxProps {
  /** Live, server-authoritative runtime config (seed + reconcile source). */
  config: RuntimeConfig;
  /** Debounced single-field config patch (wired by `Workbench` → PATCH /api/config). */
  onPatch: (patch: Partial<RuntimeConfig>) => Promise<void>;
  /** Surface an error toast on a failed patch. */
  onError: (message: string) => void;
}

type Field = keyof RuntimeConfig;

interface SliderDef {
  field: Field;
  label: string;
  unitOne: string;
  unitMany: string;
}

const SLIDERS: readonly SliderDef[] = [
  {
    field: "emailSummaryIntervalMinutes",
    label: "Email summary every",
    unitOne: "min",
    unitMany: "min",
  },
  {
    field: "smsBaseIntervalMinutes",
    label: "SMS · Fibonacci pace base",
    unitOne: "min",
    unitMany: "min",
  },
  {
    field: "fibonacciResetDays",
    label: "SMS · reset Fibonacci pace after",
    unitOne: "day",
    unitMany: "days",
  },
] as const;

const RANGE_CLASS =
  "w-full cursor-pointer appearance-none rounded-[2px] bg-[rgba(15,93,74,0.14)] outline-none " +
  "[height:4px] " +
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 " +
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal " +
  "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-panel " +
  "[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_theme(colors.teal)] " +
  "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform " +
  "[&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-110 " +
  "motion-reduce:[&::-webkit-slider-thumb]:transition-none " +
  "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full " +
  "[&::-moz-range-thumb]:bg-teal [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-panel " +
  "[&::-moz-range-thumb]:shadow-[0_0_0_1px_theme(colors.teal)] [&::-moz-range-thumb]:cursor-pointer " +
  "focus-visible:ring-2 focus-visible:ring-teal/40";

export function TimeControlsBox({
  config,
  onPatch,
  onError,
}: TimeControlsBoxProps) {
  // Optimistic local values; reconciled to `config` whenever the
  // server-authoritative prop changes (snapshot seed or `config.updated`).
  const [local, setLocal] = useState<RuntimeConfig>(config);
  useEffect(() => {
    setLocal(config);
  }, [config]);

  // Per-field debounce timers; cleared on unmount.
  const timers = useRef<Partial<Record<Field, ReturnType<typeof setTimeout>>>>(
    {},
  );
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of Object.values(t)) {
        if (id !== undefined) clearTimeout(id);
      }
    };
  }, []);

  const handleChange = (field: Field, raw: string): void => {
    const value = Number(raw);
    if (!Number.isInteger(value)) return;
    setLocal((prev) => ({ ...prev, [field]: value }));

    const existing = timers.current[field];
    if (existing !== undefined) clearTimeout(existing);
    timers.current[field] = setTimeout(() => {
      void onPatch({ [field]: value } as Partial<RuntimeConfig>).catch(() => {
        onError("Could not update the schedule — change not applied.");
      });
    }, DEBOUNCE_MS);
  };

  return (
    <div className="flex flex-col gap-3 px-[18px] pb-4 pt-[14px]">
      {SLIDERS.map((s, i) => {
        const value = local[s.field];
        const unit = value === 1 ? s.unitOne : s.unitMany;
        return (
          <div
            key={s.field}
            className={`flex flex-col gap-2 ${
              i > 0
                ? "border-t border-dashed border-[rgba(15,93,74,0.07)] pt-[14px]"
                : ""
            }`}
          >
            <label
              htmlFor={`tc-${s.field}`}
              className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-3"
            >
              <span>{s.label}</span>
              <span className="font-serif text-[14px] italic normal-case tracking-[-0.005em] text-teal [font-feature-settings:'tnum']">
                {value} {unit}
              </span>
            </label>
            <input
              id={`tc-${s.field}`}
              type="range"
              min={1}
              max={100}
              step={1}
              value={value}
              onChange={(e) => handleChange(s.field, e.target.value)}
              aria-label={`${s.label} (${value} ${unit})`}
              className={RANGE_CLASS}
            />
            <div className="flex justify-between text-[10.5px] text-ink-4 [font-feature-settings:'tnum']">
              <span>1 {s.unitOne}</span>
              <span>100 {s.unitMany}</span>
            </div>
          </div>
        );
      })}
      <p className="font-serif text-[12px] italic leading-snug text-ink-3">
        Server-authoritative — changes apply to every connected client.
      </p>
    </div>
  );
}
