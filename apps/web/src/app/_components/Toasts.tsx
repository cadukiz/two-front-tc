"use client";

/**
 * `Toasts` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007). Bottom-center
 * transient stack used by `AddTaskBar` / complete-action errors. The host is
 * `aria-live="polite"`; each toast auto-dismisses after ~3.2 s.
 */
import { useEffect } from "react";

export interface Toast {
  id: string;
  text: string;
  kind: "err" | "info";
}

interface ToastsProps {
  items: Toast[];
  onDismiss: (id: string) => void;
}

export function Toasts({ items, onDismiss }: ToastsProps) {
  const first = items[0];
  useEffect(() => {
    if (!first) return;
    const t = setTimeout(() => onDismiss(first.id), 3200);
    return () => clearTimeout(t);
  }, [first, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-pill px-4 py-[10px] text-[13px] shadow-lg animate-enter-top motion-reduce:animate-none ${
            t.kind === "err"
              ? "bg-rust text-panel"
              : "bg-ink-1 text-panel"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
