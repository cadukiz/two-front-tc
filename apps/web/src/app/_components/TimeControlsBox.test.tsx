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
import type { RuntimeConfig } from "@twofront/domain";
import { TimeControlsBox } from "./TimeControlsBox";

/**
 * Wave 10 — TimeControlsBox is TWO interactive integer sliders (ADR-0009):
 * Email summary (1–100 min) and Fibonacci reset (1–100 days). The SMS
 * Fibonacci pace is NOT configurable (that slider was removed — gaps are
 * always the natural F(k) minutes). It is seeded from the live `config`,
 * debounces changes to `onPatch`, optimistically reflects the local value,
 * and reconciles to a new server `config` prop. NOTHING about "simulated
 * minute" / `tickMs` is rendered (that lever is internal/test-only).
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const config: RuntimeConfig = {
  emailSummaryIntervalMinutes: 4,
  fibonacciResetDays: 13,
};

function ranges(): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="range"]'),
  );
}

function setRange(el: HTMLInputElement, value: number): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("TimeControlsBox — interactive sliders (ADR-0009)", () => {
  it("renders exactly two integer range sliders seeded from config", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const r = ranges();
    expect(r).toHaveLength(2);
    for (const el of r) {
      expect(el.min).toBe("1");
      expect(el.max).toBe("100");
      expect(el.step).toBe("1");
    }
    const [email, fib] = r;
    expect(email!.value).toBe("4");
    expect(fib!.value).toBe("13");
  });

  it("does NOT render an SMS Fibonacci-pace slider (pace is not configurable)", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("fibonacci pace base");
    expect(text).not.toContain("pace base");
  });

  it("labels show the current value + unit", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("4 min");
    expect(text).toContain("13 days");
  });

  it("does NOT render anything about simulated minutes / tickMs / read-only", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("simulated");
    expect(text).not.toContain("tickms");
    expect(text).not.toContain("tick");
    expect(text).not.toContain("millisecond");
    expect(text).not.toContain("read-only");
    // No "1 (simulated) minute = N ms" style time-model row.
    expect(text).not.toMatch(/\d+\s*ms\b/);
  });

  it("optimistically reflects the moved value immediately", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const [email] = ranges();
    setRange(email!, 42);
    expect(email!.value).toBe("42");
    expect(container.textContent).toContain("42 min");
  });

  it("debounces and PATCHes the changed field once after the debounce window", () => {
    vi.useFakeTimers();
    const onPatch = vi.fn(async () => {});
    mount(
      <TimeControlsBox config={config} onPatch={onPatch} onError={vi.fn()} />,
    );
    const [, fib] = ranges();
    setRange(fib!, 20);
    setRange(fib!, 30);
    setRange(fib!, 50);
    expect(onPatch).not.toHaveBeenCalled(); // still within debounce
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ fibonacciResetDays: 50 });
  });

  it("reconciles to a new server config prop (config.updated authority)", () => {
    mount(<TimeControlsBox config={config} onPatch={vi.fn()} onError={vi.fn()} />);
    const [email] = ranges();
    setRange(email!, 77); // local optimistic
    expect(email!.value).toBe("77");

    act(() => {
      root.render(
        <TimeControlsBox
          config={{ ...config, emailSummaryIntervalMinutes: 8 }}
          onPatch={vi.fn()}
          onError={vi.fn()}
        />,
      );
    });
    // Server is authoritative — the slider snaps to the broadcast value.
    expect(ranges()[0]!.value).toBe("8");
  });

  it("calls onError when the PATCH callback rejects", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onPatch = vi.fn(async () => {
      throw new Error("network");
    });
    mount(
      <TimeControlsBox config={config} onPatch={onPatch} onError={onError} />,
    );
    const [, fib] = ranges();
    setRange(fib!, 60);
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalled();
  });
});
