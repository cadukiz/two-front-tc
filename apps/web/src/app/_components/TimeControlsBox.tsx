"use client";

/**
 * `TimeControlsBox` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007).
 *
 * ADR-0008: the design's mutating sliders are intentionally **removed**. This
 * panel is a strictly READ-ONLY mirror of the authoritative, env-driven server
 * config (ADR-0004/0005): `tickMs`, `fibonacciResetMinutes`, `emailResetMinutes`.
 * Nothing here can change server state or cadence — there is no input, no POST,
 * no client scheduler. The server stays the single source of truth.
 *
 * Config type comes from `@twofront/domain` (no parallel def).
 */
import type { Config } from "@twofront/domain";

interface TimeControlsBoxProps {
  /** Authoritative server config from the SSE snapshot (read-only). */
  config: Config;
}

interface Row {
  label: string;
  value: string;
  note: string;
}

export function TimeControlsBox({ config }: TimeControlsBoxProps) {
  const rows: Row[] = [
    {
      label: "Simulated minute",
      value: `1 min = ${config.tickMs.toLocaleString("en-US")} ms`,
      note: "scheduler tick length (ADR-0004)",
    },
    {
      label: "Fibonacci reset",
      value: `every ${config.fibonacciResetMinutes} min`,
      note: "SMS interval sequence restarts (ADR-0005)",
    },
    {
      label: "Email summary cycle",
      value: `every ${config.emailResetMinutes} min`,
      note: "summary stays 1-min; cycle counter advances (ADR-0005)",
    },
  ];

  return (
    <div className="flex flex-col gap-3 px-[18px] pb-[18px] pt-[14px]">
      <dl className="flex flex-col gap-[10px]">
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded-card border border-line bg-card px-4 py-3 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] uppercase tracking-[0.14em] text-ink-3">
                {r.label}
              </dt>
              <dd className="font-mono text-[13.5px] font-semibold text-teal">
                {r.value}
              </dd>
            </div>
            <p className="mt-[5px] text-[11.5px] text-ink-3">{r.note}</p>
          </div>
        ))}
      </dl>
      <p className="font-serif text-[12px] italic leading-snug text-ink-3">
        Reflects the live server configuration. Read-only by design — these
        windows are env-driven (ADR-0004/0005) and never editable from the
        client (ADR-0008); the server remains authoritative.
      </p>
    </div>
  );
}
