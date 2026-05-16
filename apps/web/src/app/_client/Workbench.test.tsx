import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Snapshot } from "@twofront/domain";
import { Workbench } from "./Workbench";

/**
 * Smoke render (vitest + jsdom, no extra deps — mount via `react-dom/client`).
 * jsdom has no `EventSource`, so stub a no-op one — `useLiveState`'s effect
 * only constructs / addsListener / closes it. We assert the three panels mount
 * and empty states render from a seeded snapshot (the shell is real, not mock).
 */
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { EventSource: unknown }).EventSource =
    FakeEventSource;
  // Opt into React's act() environment so state updates are flushed
  // synchronously without the "not configured to support act" warning.
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container.textContent ?? "";
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const emptySnapshot: Snapshot = {
  tasks: [],
  emails: [],
  sms: [],
  lastSeq: 0,
  config: {
    emailSummaryIntervalMinutes: 1,
    smsBaseIntervalMinutes: 1,
    fibonacciResetDays: 1,
  },
};

describe("Workbench smoke render", () => {
  it("renders the three panels", () => {
    const text = mount(<Workbench initial={emptySnapshot} />);
    expect(text).toContain("My Tasks");
    expect(text).toContain("Emails");
    expect(text).toContain("SMS");
  });

  it("renders empty states when the snapshot is empty", () => {
    const text = mount(<Workbench initial={emptySnapshot} />);
    expect(text).toContain("No pending tasks.");
    expect(text).toContain("Nothing completed yet.");
    expect(text).toContain("No emails yet.");
    expect(text).toContain("No messages yet.");
  });

  it("renders seeded live data, not a mock", () => {
    const seeded: Snapshot = {
      ...emptySnapshot,
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          seq: 1,
          title: "Seeded pending task",
          status: "pending",
          createdAt: Date.now(),
          completedAt: null,
        },
      ],
      lastSeq: 1,
    };
    const text = mount(<Workbench initial={seeded} />);
    expect(text).toContain("Seeded pending task");
  });

  it("orders the SMS feed newest-first by seq (never createdAt)", () => {
    const now = Date.now();
    const seeded: Snapshot = {
      ...emptySnapshot,
      sms: [
        // Lower seq but the NEWEST createdAt — must still sort below seq 9.
        {
          id: "10000000-0000-0000-0000-000000000001",
          seq: 2,
          body: "OLDER-BY-SEQ",
          pendingTitles: [],
          fibCycle: 0,
          fibIndex: 1,
          fibMinute: 1,
          createdAt: now + 999_999,
        },
        {
          id: "10000000-0000-0000-0000-000000000002",
          seq: 9,
          body: "NEWER-BY-SEQ",
          pendingTitles: [],
          fibCycle: 0,
          fibIndex: 2,
          fibMinute: 1,
          createdAt: now,
        },
      ],
      lastSeq: 9,
    };
    const text = mount(<Workbench initial={seeded} />);
    expect(text.indexOf("NEWER-BY-SEQ")).toBeLessThan(
      text.indexOf("OLDER-BY-SEQ"),
    );
  });
});
