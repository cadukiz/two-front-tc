import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Snapshot, Sms } from "@twofront/domain";
import { Workbench } from "./Workbench";

/**
 * Wave 14 — ADR-0014: Pomodoro is FULLY DECOUPLED. It is a standalone local
 * guidance countdown with ZERO outward effect — no render-mute, no
 * `EMPTY_FRESH` swap, no emptied `Toasts`, no "Focus mode" banner. The
 * ADR-0012 render-mute regression suite ("SSE delta still applies while
 * focused", "highlight suppressed while focused", "resumes after Stop") is now
 * obsolete *by design* and was removed: there is no coupling left to guard.
 *
 * The NEW invariant asserted here: starting a Pomodoro session changes
 * NOTHING for the rest of the app — an SSE delta that arrives while a session
 * is running behaves byte-identically to one that arrives when idle (the feed
 * updates AND the arrival highlight still plays). We drive a controllable fake
 * EventSource, start a session, push an `sms.created` delta, and prove the
 * feed + the `animate-fresh-bubble` highlight are unaffected.
 */
type Listener = (ev: MessageEvent) => void;

class ControllableEventSource {
  static current: ControllableEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();
  constructor() {
    ControllableEventSource.current = this;
  }
  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  close(): void {}
  emit(type: string, payload: unknown): void {
    const ev = { data: JSON.stringify(payload) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

beforeAll(() => {
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    ControllableEventSource;
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
  ControllableEventSource.current = null;
  vi.restoreAllMocks();
});

const snapshot: Snapshot = {
  tasks: [],
  emails: [],
  sms: [],
  lastSeq: 0,
  config: {
    emailSummaryIntervalMinutes: 1,
    fibonacciResetDays: 1,
  },
};

const sms = (over: Pick<Sms, "id" | "seq" | "body">): Sms => ({
  pendingTitles: [],
  fibCycle: 0,
  fibIndex: 1,
  fibMinute: 1,
  createdAt: Date.now(),
  ...over,
});

function clickButtonByText(text: string): void {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Workbench — Pomodoro is fully decoupled (ADR-0014: a no-op)", () => {
  it("renders no 'Focus mode'/mute/notifications wording at all", () => {
    mount(<Workbench initial={snapshot} />);
    // The widget exists…
    expect(container.textContent).toContain("Pomodoro");
    // …but ZERO mute/focus-mode/notifications coupling copy anywhere.
    expect(container.textContent ?? "").not.toMatch(/Focus mode/i);
    expect(container.textContent ?? "").not.toMatch(/notifications muted/i);
    expect(container.textContent ?? "").not.toMatch(/\bmute/i);
  });

  it("does NOT show any banner or change toasts when a session starts", () => {
    mount(<Workbench initial={snapshot} />);
    clickButtonByText("Start");
    // No focus banner appears (the old render-mute banner is gone).
    expect(container.textContent ?? "").not.toMatch(/Focus mode/i);
    // The toast host is still mounted and unfiltered (no emptied path).
    clickButtonByText("Stop");
    expect(container.textContent ?? "").not.toMatch(/Focus mode/i);
  });

  it("an SSE delta WHILE a session runs behaves exactly as when idle (feed + highlight unaffected)", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    // Start a Pomodoro session.
    clickButtonByText("Start");

    // Server keeps emitting — push an SMS delta WHILE the session runs.
    act(() => {
      es.emit("sms.created", {
        type: "sms.created",
        seq: 1,
        data: sms({
          id: "10000000-0000-0000-0000-000000000001",
          seq: 1,
          body: "ARRIVED-DURING-POMODORO",
        }),
      });
    });

    // The feed updated AND the arrival highlight still plays — Pomodoro
    // running changed NOTHING (no EMPTY_FRESH swap, no mute).
    expect(container.textContent).toContain("ARRIVED-DURING-POMODORO");
    expect(container.innerHTML).toContain("animate-fresh-bubble");
  });

  it("a delta while idle also highlights normally (control case — same behaviour)", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    act(() => {
      es.emit("sms.created", {
        type: "sms.created",
        seq: 2,
        data: sms({
          id: "10000000-0000-0000-0000-000000000002",
          seq: 2,
          body: "ARRIVED-WHILE-IDLE",
        }),
      });
    });
    expect(container.textContent).toContain("ARRIVED-WHILE-IDLE");
    expect(container.innerHTML).toContain("animate-fresh-bubble");
  });
});
