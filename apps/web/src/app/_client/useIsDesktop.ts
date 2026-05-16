"use client";

/**
 * Wave 13 (ADR-0013) — picks the layout arrangement for `<Workbench>`.
 *
 * The desktop resizable `<Splitter>` tree and the narrow-screen stacked
 * fallback are MUTUALLY EXCLUSIVE *in the DOM* — only one is ever rendered.
 * A pure CSS `hidden`/`lg:hidden` switch would leave BOTH subtrees mounted,
 * duplicating every interactive element (two "Add task" inputs, two feed
 * regions) and breaking strict-mode/aria selectors. So instead we mount
 * exactly one based on a real `matchMedia` check.
 *
 * SSR / first client render returns `true` (desktop) deterministically so the
 * server markup and the first client paint match (no hydration mismatch and
 * no SSR `window` access); a `useEffect` then reconciles to the real viewport
 * and subscribes to viewport changes. `lg` = 1024px (Tailwind's default `lg`).
 */
import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktop(): boolean {
  // Deterministic SSR/first-paint value (desktop) — avoids hydration drift.
  const [isDesktop, setIsDesktop] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const sync = (): void => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}
