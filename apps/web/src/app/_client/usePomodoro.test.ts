import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  vi,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement, type ReactNode } from "react";
import {
  usePomodoro,
  remainingMsAt,
  type PomodoroState,
} from "./usePomodoro";

/**
 * Pomodoro is a purely LOCAL guidance countdown (ADR-0014, superseding the
 * Pomodoro clauses of ADR-0008/ADR-0012). These cover the pure countdown math
 * and the hook's start/stop/elapse lifecycle. The hook owns no data and is
 * consumed by nothing outside the widget — starting a session is a complete
 * no-op for the rest of the app (asserted in Workbench.pomodoro.test.tsx).
 */

describe("remainingMsAt (pure countdown helper)", () => {
  it("returns 0 when there is no active end instant", () => {
    expect(remainingMsAt(null, 1000)).toBe(0);
  });
  it("returns the clamped ms remaining", () => {
    expect(remainingMsAt(10_000, 4_000)).toBe(6_000);
  });
  it("never goes negative once elapsed", () => {
    expect(remainingMsAt(10_000, 99_000)).toBe(0);
  });
});

beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: PomodoroState;

function Probe(): ReactNode {
  latest = usePomodoro();
  return null;
}

function render(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => {
    r.render(createElement(Probe));
  });
}

afterEach(() => {
  if (root) {
    const r = root;
    act(() => r.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("usePomodoro lifecycle", () => {
  it("is idle by default with the default 25m duration", () => {
    render();
    expect(latest.active).toBe(false);
    expect(latest.remainingMs).toBe(0);
    expect(latest.durationMin).toBe(25);
    expect(latest.totalMs).toBe(25 * 60_000);
  });

  it("setDuration only changes the idle setting (no session)", () => {
    render();
    act(() => latest.setDuration(15));
    expect(latest.durationMin).toBe(15);
    expect(latest.active).toBe(false);
  });

  it("start activates a session; stop ends it immediately", () => {
    vi.useFakeTimers();
    render();
    act(() => latest.start());
    expect(latest.active).toBe(true);
    expect(latest.remainingMs).toBeGreaterThan(0);
    act(() => latest.stop());
    expect(latest.active).toBe(false);
    expect(latest.remainingMs).toBe(0);
  });

  it("auto-resumes (active → false) once the duration elapses", () => {
    vi.useFakeTimers();
    render();
    act(() => latest.setDuration(15));
    act(() => latest.start());
    expect(latest.active).toBe(true);
    // Advance past the full 15-minute session.
    act(() => {
      vi.advanceTimersByTime(15 * 60_000 + 2_000);
    });
    expect(latest.active).toBe(false);
    expect(latest.remainingMs).toBe(0);
  });
});
