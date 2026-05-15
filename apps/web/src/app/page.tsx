/**
 * Server Component (ADR-0002 / ADR-0006). SSR-seeds the live data layer from
 * the authoritative in-memory store so the first paint is real data — never
 * the design's deleted client mock — then hands off to the `"use client"`
 * `Workbench`, which opens the SSE stream and takes over.
 *
 * `force-dynamic`: the snapshot must be read per-request (the store is a
 * live, mutating singleton); this route is never statically prerendered.
 */
import type { ReactNode } from "react";
import { getStore } from "@/server/store";
import { Workbench } from "./_client/Workbench";

export const dynamic = "force-dynamic";

export default function Page(): ReactNode {
  const initial = getStore().snapshot();
  return <Workbench initial={initial} />;
}
