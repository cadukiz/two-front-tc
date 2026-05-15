"use client";

/**
 * `useFreshIds` — tracks which feed ids are "freshly arrived" so a row/card can
 * play the Tailwind `animate-fresh` arrival highlight once. Pure client state;
 * the server stays authoritative (this only affects a CSS animation class).
 *
 * On every render it diffs the incoming id set against the ids it has already
 * seen: any id not seen before is marked fresh and auto-cleared after
 * `HIGHLIGHT_MS`. The very first batch (initial SSR snapshot) is treated as
 * "already seen" so existing rows don't all flash on first paint.
 */
import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_MS = 1800;

export function useFreshIds(ids: readonly string[]): ReadonlySet<string> {
  const seenRef = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    // First pass: snapshot everything currently present as "already seen"
    // (no flash on initial paint), seed nothing fresh.
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const seen = seenRef.current;
    const arrived: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        arrived.push(id);
      }
    }
    if (arrived.length === 0) return;

    setFresh((prev) => {
      const next = new Set(prev);
      for (const id of arrived) next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const id of arrived) next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [ids]);

  return fresh;
}
