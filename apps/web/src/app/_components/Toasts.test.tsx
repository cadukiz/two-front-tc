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
import { Toasts, type Toast } from "./Toasts";

/**
 * Wave 6.3 — Toasts tests. Real behavior: renders the items in an
 * `aria-live="polite"` host and auto-dismisses the head after ~3.2 s.
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
  vi.useRealTimers();
});

describe("Toasts", () => {
  it("renders items inside an aria-live polite host", () => {
    const items: Toast[] = [{ id: "t1", text: "Could not add task", kind: "err" }];
    mount(<Toasts items={items} onDismiss={vi.fn()} />);
    const host = container.querySelector('[aria-live="polite"]');
    expect(host).not.toBeNull();
    expect(container.textContent).toContain("Could not add task");
  });

  it("auto-dismisses the head toast after ~3.2s", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const items: Toast[] = [{ id: "t1", text: "boom", kind: "err" }];
    mount(<Toasts items={items} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });
});
