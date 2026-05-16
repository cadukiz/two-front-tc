import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Snapshot, Sms } from "@twofront/domain";
import { Workbench } from "./Workbench";

/**
 * Wave 9.2 — HONEST semantics check (ADR-0008): starting a Pomodoro mutes the
 * *visual notification noise* only. The server keeps emitting and the SSE
 * reducer keeps applying — the feeds must STILL update while "focused". We
 * drive a controllable fake EventSource, start a focus session, push an
 * `sms.created` delta, and assert the SMS feed updated *and* the focus banner
 * is shown (proving render-mute is active, not a data pause).
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

describe("Workbench — Pomodoro focus mode is local render-mute only", () => {
  it("keeps applying SSE deltas while focused (server unaffected)", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    // Activate focus mode.
    clickButtonByText("Start");
    expect(container.textContent).toContain("Focus mode active");

    // Server keeps emitting — push an SMS delta WHILE focused.
    act(() => {
      es.emit("sms.created", {
        type: "sms.created",
        seq: 1,
        data: sms({
          id: "10000000-0000-0000-0000-000000000001",
          seq: 1,
          body: "ARRIVED-DURING-FOCUS",
        }),
      });
    });

    // The reducer still applied it — the feed updated underneath the mute.
    expect(container.textContent).toContain("ARRIVED-DURING-FOCUS");
  });

  it("suppresses the arrival highlight animation while focused", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    clickButtonByText("Start");
    act(() => {
      es.emit("sms.created", {
        type: "sms.created",
        seq: 1,
        data: sms({
          id: "10000000-0000-0000-0000-000000000002",
          seq: 1,
          body: "MUTED-BUBBLE",
        }),
      });
    });

    // Content is present (data not paused) but no fresh/highlight animation.
    expect(container.textContent).toContain("MUTED-BUBBLE");
    expect(container.innerHTML).not.toContain("animate-fresh-bubble");
  });

  it("resumes normal highlight rendering after Stop", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    clickButtonByText("Start");
    expect(container.textContent).toContain("Focus mode active");
    clickButtonByText("Stop");
    expect(container.textContent).not.toContain("Focus mode active");

    // A delta after Stop highlights normally again.
    act(() => {
      es.emit("sms.created", {
        type: "sms.created",
        seq: 2,
        data: sms({
          id: "10000000-0000-0000-0000-000000000003",
          seq: 2,
          body: "POST-FOCUS-BUBBLE",
        }),
      });
    });
    expect(container.textContent).toContain("POST-FOCUS-BUBBLE");
    expect(container.innerHTML).toContain("animate-fresh-bubble");
  });
});
