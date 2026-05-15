import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Config } from "@twofront/domain";
import { TimeControlsBox } from "./TimeControlsBox";

/**
 * Wave 9.1 — TimeControlsBox is a strictly READ-ONLY mirror of the
 * authoritative server config (ADR-0008). It must render the injected
 * `tickMs` / `fibonacciResetMinutes` / `emailResetMinutes` and must NOT
 * expose any input that could mutate server state or cadence.
 */
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const config: Config = {
  tickMs: 60000,
  fibonacciResetMinutes: 13,
  emailResetMinutes: 21,
};

describe("TimeControlsBox (read-only server config)", () => {
  it("renders the injected config values", () => {
    mount(<TimeControlsBox config={config} />);
    const text = container.textContent ?? "";
    expect(text).toContain("60,000 ms");
    expect(text).toContain("every 13 min");
    expect(text).toContain("every 21 min");
  });

  it("renders a caption clarifying it is read-only / server-driven", () => {
    mount(<TimeControlsBox config={config} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain("read-only");
    expect(text).toContain("server remains authoritative");
  });

  it("exposes NO mutating inputs (no input/range/form/submit button)", () => {
    mount(<TimeControlsBox config={config} />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(
      container.querySelectorAll('input[type="range"]'),
    ).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("reflects different server config without any local override", () => {
    mount(
      <TimeControlsBox
        config={{
          tickMs: 50,
          fibonacciResetMinutes: 4,
          emailResetMinutes: 9,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("50 ms");
    expect(text).toContain("every 4 min");
    expect(text).toContain("every 9 min");
  });
});
