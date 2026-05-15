"use client";

import { formatTime } from "../lib/format";

export type Connection = "connecting" | "live" | "reconnecting";

interface AppHeaderProps {
  connection: Connection;
  now: number;
}

/**
 * Sage header bar: brand + candidate block + clock + connection pill
 * (ported .jsx → .tsx, Tailwind-only — ADR-0007). The pill reflects the live
 * `EventSource` connection state from `useLiveState`.
 */
export function AppHeader({ connection, now }: AppHeaderProps) {
  const pill =
    connection === "live"
      ? {
          wrap: "text-teal border-[rgba(15,93,74,0.25)] bg-teal-50",
          dot: "bg-teal animate-pulse",
          label: "Live stream",
        }
      : connection === "reconnecting"
        ? {
            wrap: "text-warn border-[rgba(138,106,26,0.25)] bg-warn-bg",
            dot: "bg-warn-dot animate-blink",
            label: "Reconnecting…",
          }
        : {
            wrap: "text-ink-3 border-[rgba(8,71,54,0.18)] bg-sage-soft",
            dot: "bg-ink-4",
            label: "Connecting…",
          };

  return (
    <header className="sticky top-0 z-20 flex h-[76px] flex-none items-center justify-between gap-6 bg-sage px-[28px]">
      <div className="flex items-center gap-[14px]">
        <svg
          className="block h-[34px] w-[80px]"
          viewBox="0 0 130 56"
          aria-label="Two Front"
        >
          <ellipse
            cx="65"
            cy="28"
            rx="62"
            ry="24"
            fill="none"
            stroke="#0E5C47"
            strokeWidth="1.2"
          />
          <ellipse
            cx="65"
            cy="28"
            rx="57"
            ry="20"
            fill="none"
            stroke="#0E5C47"
            strokeWidth="0.6"
            opacity="0.5"
          />
          <text
            x="65"
            y="25"
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            letterSpacing="2.2"
            fill="#0E5C47"
          >
            TWO
          </text>
          <text
            x="65"
            y="40"
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            letterSpacing="2.2"
            fill="#0E5C47"
          >
            FRONT
          </text>
        </svg>
        <div className="text-[22px] font-semibold leading-none tracking-[-0.015em] text-teal-900">
          Task{" "}
          <span className="font-serif font-normal italic">Tracker</span>
        </div>
        <div className="ml-[14px] border-l border-[rgba(8,71,54,0.2)] pl-[14px] text-[12px] text-teal-900 opacity-70 max-[720px]:hidden">
          Live operations dashboard
        </div>
      </div>

      <div className="flex items-center gap-[14px]">
        <div className="flex items-center gap-3 rounded-pill border border-[rgba(8,71,54,0.22)] bg-panel px-4 py-2 text-teal-900 shadow-sm">
          <span className="text-[14px] font-medium tracking-[0.01em] text-teal max-[1024px]:hidden after:ml-px after:opacity-70 after:content-[':']">
            Candidate
          </span>
          <span className="text-[15.5px] font-semibold tracking-[-0.005em] text-teal-900 max-[720px]:hidden">
            Cadu Kizelevicius
          </span>
          <span
            className="inline-flex overflow-hidden rounded-[3px] leading-none shadow-[0_0_0_1px_rgba(8,71,54,0.12)]"
            title="Brazil"
            aria-label="Brazil"
          >
            <svg viewBox="0 0 28 20" width="22" height="16">
              <rect width="28" height="20" rx="2" fill="#009C3B" />
              <polygon points="14,3 25,10 14,17 3,10" fill="#FFDF00" />
              <circle cx="14" cy="10" r="3.6" fill="#002776" />
              <path
                d="M10.8 10.6 Q14 8.4 17.2 10.6"
                stroke="#fff"
                strokeWidth="0.6"
                fill="none"
              />
            </svg>
          </span>
          <a
            className="ml-px inline-grid h-[30px] w-[30px] place-items-center rounded-full border border-[rgba(8,71,54,0.22)] bg-card text-teal transition-[background,color,transform] duration-150 hover:-translate-y-px hover:bg-teal hover:text-panel"
            href="https://linkedin.com/in/cadukizelevicius"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Cadu Kizelevicius on LinkedIn"
            title="LinkedIn — cadukizelevicius"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
            >
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
          </a>
        </div>
        <div className="font-mono text-[12px] tracking-[0.04em] text-teal-900 opacity-75">
          {formatTime(now)}
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-pill border py-[6px] pl-[10px] pr-3 text-[12px] font-medium tracking-[0.01em] ${pill.wrap}`}
        >
          <span className={`h-[7px] w-[7px] rounded-full ${pill.dot}`} />
          {pill.label}
        </div>
      </div>
    </header>
  );
}
