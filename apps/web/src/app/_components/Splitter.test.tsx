import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Splitter } from "./Splitter";

/**
 * Wave 13.1 — `<Splitter>` component (jsdom). Drives the real DOM events the
 * spec calls out: mousedown on a handle → mousemove on WINDOW updates the grid
 * track sizes; the `minPx` clamp prevents a side dropping below its minimum;
 * double-click resets the pair to equal; the handle exposes `role="separator"`
 * + `aria-orientation`; nested Splitters render. jsdom has no real layout, so
 * `getBoundingClientRect` is stubbed to a fixed container size — the math under
 * test is the px→fr conversion + clamp, not browser layout.
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

/** Stub the grid container's measured width/height (jsdom has no layout). */
function stubContainerRect(widthPx: number, heightPx: number): void {
  const grid = container.querySelector<HTMLElement>('[data-splitter="grid"]');
  if (!grid) throw new Error("splitter grid not found");
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: widthPx,
    bottom: heightPx,
    width: widthPx,
    height: heightPx,
    toJSON: () => ({}),
  } as DOMRect);
}

function handles(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="separator"]'),
  );
}

function grid(): HTMLElement {
  const g = container.querySelector<HTMLElement>('[data-splitter="grid"]');
  if (!g) throw new Error("splitter grid not found");
  return g;
}

/** Parse the fr numbers out of a `gridTemplateColumns/Rows` string. */
function trackFractions(template: string): number[] {
  return Array.from(template.matchAll(/minmax\(0(?:px)?,\s*([\d.]+)fr\)/g)).map(
    (m) => Number(m[1]),
  );
}

describe("Splitter — structure & a11y", () => {
  it("renders one handle between N panes (N-1 separators)", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
        <div>C</div>
      </Splitter>,
    );
    expect(handles()).toHaveLength(2);
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("C");
  });

  it("exposes role=separator + aria-orientation matching the direction", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    const [h] = handles();
    expect(h).toBeDefined();
    // A row (side-by-side) split is divided by a VERTICAL separator.
    expect(h!.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("uses aria-orientation=horizontal for a column (stacked) split", () => {
    mount(
      <Splitter direction="col" initialSizes={[1, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    expect(handles()[0]!.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("renders the runtime grid-template as the only inline style (ADR-0013)", () => {
    mount(
      <Splitter direction="row" initialSizes={[2, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    const g = grid();
    expect(g.style.gridTemplateColumns).toContain("minmax(0");
    expect(g.style.gridTemplateColumns).toContain("fr)");
    expect(trackFractions(g.style.gridTemplateColumns)).toEqual([2, 1]);
  });

  it("renders a nested Splitter", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1]} minPx={50}>
        <div>LEFT</div>
        <Splitter direction="col" initialSizes={[1, 1]} minPx={40}>
          <div>TOPRIGHT</div>
          <div>BOTRIGHT</div>
        </Splitter>
      </Splitter>,
    );
    // Outer + inner each contribute one separator.
    expect(handles()).toHaveLength(2);
    expect(container.textContent).toContain("TOPRIGHT");
    expect(container.textContent).toContain("BOTRIGHT");
  });
});

describe("Splitter — drag resize", () => {
  it("mousedown + window mousemove resizes the dragged pair", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    stubContainerRect(800, 600);
    const [h] = handles();
    const before = trackFractions(grid().style.gridTemplateColumns);
    expect(before).toEqual([1, 1]);

    act(() => {
      h!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 0 }),
      );
    });
    // Drag the divider 200px to the right → +0.5fr to A, −0.5fr to B.
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 600, clientY: 0 }),
      );
    });
    const after = trackFractions(grid().style.gridTemplateColumns);
    expect(after[0]!).toBeCloseTo(1.5, 6);
    expect(after[1]!).toBeCloseTo(0.5, 6);
    expect(after[0]! + after[1]!).toBeCloseTo(2, 6);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  });

  it("clamps so neither side drops below minPx", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1]} minPx={100}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    stubContainerRect(800, 600); // 2fr → 400px/fr, minPx 100 → 0.25fr floor
    const [h] = handles();
    act(() => {
      h!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 0 }),
      );
    });
    // Yank far past the edge — B must clamp at the 0.25fr (100px) floor.
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 5000,
          clientY: 0,
        }),
      );
    });
    const after = trackFractions(grid().style.gridTemplateColumns);
    expect(after[1]!).toBeCloseTo(0.25, 6);
    expect(after[0]!).toBeCloseTo(1.75, 6);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  });

  it("stops tracking after mouseup (a later move does nothing)", () => {
    mount(
      <Splitter direction="row" initialSizes={[1, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    stubContainerRect(800, 600);
    const [h] = handles();
    act(() => {
      h!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 600, clientY: 0 }),
      );
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    const settled = trackFractions(grid().style.gridTemplateColumns);
    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 0 }),
      );
    });
    expect(trackFractions(grid().style.gridTemplateColumns)).toEqual(settled);
  });
});

describe("Splitter — double-click reset", () => {
  it("resets the pair to its average on handle double-click", () => {
    mount(
      <Splitter direction="row" initialSizes={[3, 1]} minPx={50}>
        <div>A</div>
        <div>B</div>
      </Splitter>,
    );
    stubContainerRect(800, 600);
    const [h] = handles();
    expect(trackFractions(grid().style.gridTemplateColumns)).toEqual([3, 1]);
    act(() => {
      h!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const after = trackFractions(grid().style.gridTemplateColumns);
    expect(after[0]!).toBeCloseTo(2, 6);
    expect(after[1]!).toBeCloseTo(2, 6);
  });
});
