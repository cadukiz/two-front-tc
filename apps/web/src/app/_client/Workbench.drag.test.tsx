import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Snapshot, Task, Email, Sms } from "@twofront/domain";
import { Workbench } from "./Workbench";

/**
 * Wave 9.3 — client-only drag prioritization is COSMETIC + NON-PERSISTENT
 * (ADR-0008). These assert the keyboard reorder (same overlay path as drag)
 * reorders only the pending list, leaves completed/emails/SMS strictly
 * `seq`-driven, and resets sensibly when a task leaves via a normal SSE
 * `task.completed` delta (SSE is never broken by the overlay).
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

const mkTask = (id: string, seq: number, title: string): Task => ({
  id,
  seq,
  title,
  status: "pending",
  createdAt: 0,
  completedAt: null,
});

const email = (id: string, seq: number, subject: string): Email => ({
  id,
  seq,
  kind: "summary",
  subject,
  body: "b",
  taskId: null,
  pending: [],
  createdAt: 0,
});

const sms = (id: string, seq: number, body: string): Sms => ({
  id,
  seq,
  body,
  pendingTitles: [],
  fibCycle: 0,
  fibIndex: 1,
  fibMinute: 1,
  createdAt: 0,
});

const snapshot: Snapshot = {
  tasks: [
    mkTask("33333333-3333-3333-3333-333333333333", 3, "TASK-C"),
    mkTask("22222222-2222-2222-2222-222222222222", 2, "TASK-B"),
    mkTask("11111111-1111-1111-1111-111111111111", 1, "TASK-A"),
  ],
  emails: [email("e0000000-0000-0000-0000-000000000001", 5, "EMAIL-ONE")],
  sms: [sms("50000000-0000-0000-0000-000000000001", 4, "SMS-ONE")],
  lastSeq: 5,
  config: {
    emailSummaryIntervalMinutes: 1,
    smsBaseIntervalMinutes: 1,
    fibonacciResetDays: 1,
  },
};

function pendingTitlesInOrder(): string[] {
  // The pending titles appear in DOM order; pull them out of the text.
  const text = container.textContent ?? "";
  return ["TASK-A", "TASK-B", "TASK-C"].sort(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  );
}

function handleFor(title: string): HTMLButtonElement {
  // Each pending row's reorder control is a button labelled "Reorder <title>…".
  const btn = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith(`Reorder ${title}`),
  );
  if (!btn) throw new Error(`reorder handle for ${title} not found`);
  return btn;
}

describe("Workbench — client-only drag prioritization (cosmetic)", () => {
  it("reorders the pending list locally via keyboard without persisting", () => {
    mount(<Workbench initial={snapshot} />);
    // seq-desc default: C, B, A
    expect(pendingTitlesInOrder()).toEqual(["TASK-C", "TASK-B", "TASK-A"]);

    // Move TASK-A up one slot (A swaps above B) → C, A, B
    const handle = handleFor("TASK-A");
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(pendingTitlesInOrder()).toEqual(["TASK-C", "TASK-A", "TASK-B"]);
  });

  it("does not touch the completed list, emails or SMS", () => {
    const withCompleted: Snapshot = {
      ...snapshot,
      tasks: [
        ...snapshot.tasks,
        {
          ...mkTask(
            "99999999-9999-9999-9999-999999999999",
            6,
            "DONE-TASK",
          ),
          status: "completed",
          completedAt: 1,
        },
      ],
      lastSeq: 6,
    };
    mount(<Workbench initial={withCompleted} />);
    const before = container.textContent ?? "";
    expect(before).toContain("DONE-TASK");
    expect(before).toContain("EMAIL-ONE");
    expect(before).toContain("SMS-ONE");

    act(() => {
      handleFor("TASK-A").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });

    const after = container.textContent ?? "";
    // Pending reordered, but completed/emails/sms content unchanged & present.
    expect(after).toContain("DONE-TASK");
    expect(after).toContain("EMAIL-ONE");
    expect(after).toContain("SMS-ONE");
    expect(pendingTitlesInOrder()).toEqual(["TASK-C", "TASK-A", "TASK-B"]);
  });

  it("resets sensibly when a reordered task leaves via SSE", () => {
    mount(<Workbench initial={snapshot} />);
    const es = ControllableEventSource.current;
    if (!es) throw new Error("EventSource not constructed");

    // Build a local order: move A to top → A, C, B
    act(() => {
      handleFor("TASK-A").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    act(() => {
      handleFor("TASK-A").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(pendingTitlesInOrder()).toEqual(["TASK-A", "TASK-C", "TASK-B"]);

    // Server completes TASK-A — a normal SSE delta (overlay must not break it).
    act(() => {
      es.emit("task.completed", {
        type: "task.completed",
        seq: 7,
        data: {
          ...mkTask(
            "11111111-1111-1111-1111-111111111111",
            7,
            "TASK-A",
          ),
          status: "completed",
          completedAt: 123,
        },
      });
    });

    // TASK-A drops out of the pending order; the rest fall back to seq order.
    const text = container.textContent ?? "";
    const remaining = ["TASK-B", "TASK-C"].sort(
      (a, b) => text.indexOf(a) - text.indexOf(b),
    );
    expect(remaining).toEqual(["TASK-C", "TASK-B"]);
  });
});
