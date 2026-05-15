import type { ReactNode } from "react";
import { DEFAULT_TICK_MS } from "@twofront/domain";

/**
 * Wave 1 placeholder Server Component. It imports a value from
 * `@twofront/domain` purely to prove the workspace wiring resolves and
 * type-checks; the real UI is a later, gated wave. We render the static
 * `DEFAULT_TICK_MS` default and do NOT call `resolveConfig` (the two reset
 * windows are required env and intentionally absent here).
 */
export default function Page(): ReactNode {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">TwoFront</h1>
      <p className="mt-2 text-sm text-gray-600">
        Scaffold online. Domain wiring proven via{" "}
        <code>@twofront/domain</code>.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Default simulated-minute length:{" "}
        <strong>{DEFAULT_TICK_MS} ms</strong>
      </p>
    </main>
  );
}
