import type { ReactNode } from "react";

/**
 * `Panel` — a workbench column (ported .jsx → .tsx, Tailwind-only per
 * ADR-0007). `kind="tasks"` renders the wooden clipboard board + metal clip;
 * other kinds use the pale-cream paper surface.
 */
export type PanelKind =
  | "tasks"
  | "emails"
  | "sms"
  | "pomodoro"
  | "time-controls";

interface PanelProps {
  kind: PanelKind;
  title: string;
  count?: number | undefined;
  meta?: ReactNode;
  icon?: ReactNode;
  clip?: boolean;
  children: ReactNode;
}

export function Panel({
  kind,
  title,
  count,
  meta,
  icon,
  clip,
  children,
}: PanelProps) {
  const isTasks = kind === "tasks";

  const surface = isTasks
    ? "bg-clipboard border-[rgba(60,40,20,0.16)] shadow-clipboard pt-[38px]"
    : "bg-panel border-line shadow-sm";

  const titleColor = isTasks ? "text-clip" : "text-ink-1";
  const titleSize = isTasks ? "text-[38px]" : "text-[30px]";
  const iconColor = isTasks ? "text-clip opacity-[0.78]" : "text-teal";
  const countColor = isTasks
    ? "text-clip bg-[rgba(255,253,244,0.55)] border-[rgba(42,31,15,0.22)]"
    : "text-teal bg-teal-50 border-[rgba(15,93,74,0.15)]";
  const metaColor = isTasks ? "text-[rgba(42,31,15,0.6)]" : "text-ink-3";

  return (
    <section
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-panel border ${surface}`}
      aria-labelledby={`panel-${kind}-h`}
    >
      {clip && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[6px] z-[6] h-[34px] w-[150px] -translate-x-1/2 rounded-[7px_7px_11px_11px] bg-gradient-to-b from-[#E1E5DC] via-[#8A918A] to-[#5F6760] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_-2px_0_rgba(0,0,0,0.22)_inset,0_4px_9px_rgba(0,0,0,0.18)]"
        />
      )}

      <div
        className={`flex flex-none items-end justify-between gap-3 border-b border-line-soft px-[22px] pb-[14px] ${
          isTasks ? "pt-[14px]" : "pt-[18px]"
        }`}
      >
        <div className="flex items-baseline gap-[10px]">
          {icon && (
            <span
              aria-hidden="true"
              className={`relative top-[4px] -mr-[2px] inline-flex items-center [&_svg]:h-[20px] [&_svg]:w-auto [&_svg]:max-w-[30px] ${iconColor} ${
                isTasks
                  ? "top-[8px] [&_svg]:h-[26px] [&_svg]:max-w-[38px]"
                  : ""
              }`}
            >
              {icon}
            </span>
          )}
          <h2
            id={`panel-${kind}-h`}
            className={`m-0 font-serif italic font-normal leading-none tracking-[-0.015em] ${titleColor} ${titleSize}`}
          >
            {title}
          </h2>
          {count != null && (
            <span
              className={`rounded-pill border px-[9px] py-[3px] text-[12px] font-medium tracking-[0.02em] ${countColor}`}
            >
              {count}
            </span>
          )}
        </div>
        {meta && (
          <div
            className={`text-[11px] uppercase tracking-[0.16em] ${metaColor} [&_.dot]:mx-[8px] [&_.dot]:mb-[1px] [&_.dot]:inline-block [&_.dot]:h-[5px] [&_.dot]:w-[5px] [&_.dot]:rounded-full [&_.dot]:align-middle ${
              isTasks
                ? "[&_.dot]:bg-[rgba(42,31,15,0.45)]"
                : "[&_.dot]:bg-teal"
            }`}
          >
            {meta}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

interface EmptyProps {
  children: ReactNode;
  className?: string;
}

export function Empty({ children, className = "" }: EmptyProps) {
  return (
    <div
      className={`mx-[14px] mb-[18px] mt-[8px] rounded-card border border-dashed border-line bg-[rgba(255,255,255,0.5)] px-4 py-[22px] text-center text-[13px] text-ink-3 [&_.em]:font-serif [&_.em]:italic [&_.em]:text-[15px] [&_.em]:text-teal ${className}`}
    >
      {children}
    </div>
  );
}
