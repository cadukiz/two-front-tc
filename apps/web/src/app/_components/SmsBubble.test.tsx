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
import type { Sms } from "@twofront/domain";
import { SmsBubble } from "./SmsBubble";

/**
 * Wave 6.3 — SmsBubble tests. Real behavior: renders `body` + `pendingTitles`
 * + `formatDateTime(createdAt)` and the informational Fibonacci caption
 * derived from the contract fields `fibIndex` / `fibMinute`.
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

const baseSms: Sms = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  seq: 7,
  body: "Reminder · 2 tasks still pending:",
  pendingTitles: ["Approve invoice", "Confirm vendor"],
  fibCycle: 0,
  fibIndex: 4,
  fibMinute: 3,
  createdAt: 1_700_000_000_000,
};

describe("SmsBubble", () => {
  it("renders the body, the pending titles, the time and the Fibonacci caption", () => {
    mount(<SmsBubble msg={baseSms} fresh={false} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Reminder · 2 tasks still pending:");
    expect(text).toContain("Approve invoice");
    expect(text).toContain("Confirm vendor");
    expect(text).toContain("Fibonacci #4");
    expect(text).toContain("every 3m");
    // formatDateTime → short month present
    const month = new Date(baseSms.createdAt).toLocaleString("en-US", {
      month: "short",
    });
    expect(text).toContain(month);
  });

  it("renders only the body when there are no pending titles", () => {
    const empty: Sms = {
      ...baseSms,
      body: "All clear — no pending tasks right now.",
      pendingTitles: [],
    };
    mount(<SmsBubble msg={empty} fresh={false} />);
    const text = container.textContent ?? "";
    expect(text).toContain("All clear — no pending tasks right now.");
    expect(container.querySelector("ul")).toBeNull();
  });

  it("collapses the list past 4 titles with a '+N more' tail", () => {
    const many: Sms = {
      ...baseSms,
      pendingTitles: ["a", "b", "c", "d", "e", "f"],
    };
    mount(<SmsBubble msg={many} fresh={false} />);
    expect(container.textContent).toContain("+2 more");
  });
});
