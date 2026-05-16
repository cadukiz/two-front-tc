"use client";

/**
 * Wave 13 — generic, nestable resizable `<Splitter>` (ADR-0013).
 *
 * Lays its children out in a single CSS grid track axis with a draggable 16px
 * handle between every adjacent pair. Sizes are fractional (`fr`) units kept in
 * React state; the resulting `grid-template-columns` (row split) or
 * `grid-template-rows` (column split) string is **runtime-computed** and is the
 * ONE sanctioned `style={{}}` exception to ADR-0007 (a dynamic, non-themeable
 * value that cannot be a Tailwind class — see ADR-0013). Every *visible* style
 * (handle surface, grip, resize cursors, hover/active accent, the `min-h-0
 * min-w-0` containment discipline, motion-reduce) is a Tailwind utility against
 * our design tokens (`teal` #0E5C47 / `line` / `ink-*`), not the stock palette.
 *
 * Mechanics (per spec): mousedown snapshots the pair's start sizes + container
 * px + total fr and attaches the move/up listeners on `window` (not the handle,
 * so a fast drag that leaves the 16px strip keeps tracking); mousemove converts
 * `Δpx → Δfr` and applies `+Δ/−Δ` to the pair, clamped so neither side falls
 * below `minPx`; mouseup clears the drag and restores cursor/userSelect;
 * double-click resets that pair to the average of its two sizes. The pure
 * arithmetic lives in `splitterMath.ts` (separately unit-tested); this file is
 * the thin DOM/React event shell. Nesting is just a `<Splitter>` as a child.
 *
 * Small-screen fallback: the drag spec is desktop-oriented and the `minPx`
 * clamps make N panes un-fittable on a phone. Callers therefore wrap the
 * Splitter tree in a Tailwind responsive switch (block stack < breakpoint;
 * Splitter ≥ breakpoint) — see `Workbench`. The Splitter itself stays a pure
 * desktop layout primitive; it does not try to be responsive internally.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Children,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";
import { deltaToFr, clampPairDelta, resetPairToAverage } from "./splitterMath";

const HANDLE_PX = 16;

export type SplitterDirection = "row" | "col";

interface SplitterProps {
  /** `row` = panes side-by-side (vertical handles); `col` = stacked. */
  direction: SplitterDirection;
  /** One fr value per child; length must equal the child count. */
  initialSizes: number[];
  /** Minimum px each pane may shrink to. A single value or one per pane. */
  minPx: number | number[];
  children: ReactNode;
  /** Optional extra classes on the grid container. */
  className?: string;
}

interface DragState {
  /** Index of the LEFT/TOP pane of the dragged pair. */
  index: number;
  /** Pointer coordinate along the split axis at mousedown. */
  startPos: number;
  /** Snapshot of all sizes at mousedown. */
  startSizes: number[];
  /** Container size (px) along the split axis at mousedown. */
  containerPx: number;
  /** Sum of all fr at mousedown (the px↔fr scale denominator). */
  sumFr: number;
}

export function Splitter({
  direction,
  initialSizes,
  minPx,
  children,
  className = "",
}: SplitterProps): ReactNode {
  const isRow = direction === "row";
  const items = Children.toArray(children);

  const [sizes, setSizes] = useState<number[]>(() => [...initialSizes]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const minForPane = useCallback(
    (i: number): number => {
      if (typeof minPx === "number") return minPx;
      const v = minPx[i];
      return v ?? 0;
    },
    [minPx],
  );

  const onMouseDown = useCallback(
    (index: number, e: React.MouseEvent): void => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const containerPx = isRow ? rect.width : rect.height;
      const sumFr = sizes.reduce((acc, n) => acc + n, 0);
      dragRef.current = {
        index,
        startPos: isRow ? e.clientX : e.clientY,
        startSizes: [...sizes],
        containerPx,
        sumFr,
      };
      document.body.style.cursor = isRow ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [isRow, sizes],
  );

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      const d = dragRef.current;
      if (!d) return;
      // noUncheckedIndexedAccess: the pair endpoints are `number | undefined`.
      // Guard them explicitly (no `!`) — bail rather than NaN the layout.
      const startA = d.startSizes[d.index];
      const startB = d.startSizes[d.index + 1];
      if (startA === undefined || startB === undefined) return;

      const pos = isRow ? e.clientX : e.clientY;
      const deltaPx = pos - d.startPos;
      const deltaFr = deltaToFr(deltaPx, d.sumFr, d.containerPx);
      const [a, b] = clampPairDelta({
        startA,
        startB,
        deltaFr,
        sumFr: d.sumFr,
        containerPx: d.containerPx,
        minPx: Math.max(minForPane(d.index), minForPane(d.index + 1)),
      });
      setSizes((prev) => {
        const next = [...prev];
        next[d.index] = a;
        next[d.index + 1] = b;
        return next;
      });
    }

    function onUp(): void {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isRow, minForPane]);

  const onDoubleClick = useCallback((index: number): void => {
    setSizes((prev) => {
      const a = prev[index];
      const b = prev[index + 1];
      if (a === undefined || b === undefined) return prev;
      const [na, nb] = resetPairToAverage(a, b);
      const next = [...prev];
      next[index] = na;
      next[index + 1] = nb;
      return next;
    });
  }, []);

  // Build the runtime grid template: minmax(0, Afr) <16px> minmax(0, Bfr) …
  // minmax(0, …) is what lets a flex/grid child actually shrink below its
  // content (the `min-w-0/min-h-0` discipline, expressed in the track).
  const template = items
    .map((_, i) => {
      const fr = sizes[i] ?? 1;
      const cell = `minmax(0, ${fr}fr)`;
      return i < items.length - 1 ? `${cell} ${HANDLE_PX}px` : cell;
    })
    .join(" ");

  const gridStyle = isRow
    ? { gridTemplateColumns: template }
    : { gridTemplateRows: template };

  return (
    <div
      ref={containerRef}
      data-splitter="grid"
      className={`grid h-full min-h-0 w-full min-w-0 ${
        isRow ? "grid-rows-1" : "grid-cols-1"
      } ${className}`}
      // ADR-0013: the SINGLE sanctioned inline style — a runtime-computed grid
      // track string that cannot be expressed as a Tailwind utility class.
      style={gridStyle}
    >
      {items.map((child, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={isValidElement(child) && child.key != null ? child.key : i}>
            <div className="grid min-h-0 min-w-0 overflow-hidden">{child}</div>
            {!isLast && (
              <div
                role="separator"
                aria-orientation={isRow ? "vertical" : "horizontal"}
                aria-label="Resize panels"
                tabIndex={-1}
                onMouseDown={(e) => onMouseDown(i, e)}
                onDoubleClick={() => onDoubleClick(i)}
                className={[
                  "group relative flex items-center justify-center",
                  "select-none touch-none bg-transparent",
                  isRow
                    ? "cursor-col-resize h-full min-h-0"
                    : "cursor-row-resize w-full min-w-0",
                ].join(" ")}
                title="Drag to resize · double-click to reset"
              >
                {/* Rest: a faint hairline on the design's `line` token.
                    Hover/active: the brand `teal`. The grip is a small pill
                    that scales up on hover (motion-reduce respected). */}
                <span
                  aria-hidden="true"
                  className={[
                    "absolute bg-[rgba(15,93,74,0.14)]",
                    "transition-colors duration-150 motion-reduce:transition-none",
                    "group-hover:bg-teal group-active:bg-teal-900",
                    isRow ? "inset-y-0 w-px left-1/2 -translate-x-1/2" : "inset-x-0 h-px top-1/2 -translate-y-1/2",
                  ].join(" ")}
                />
                <span
                  aria-hidden="true"
                  className={[
                    "relative rounded-pill bg-[rgba(15,93,74,0.22)]",
                    "transition-[transform,background-color] duration-150 motion-reduce:transition-none",
                    "group-hover:bg-teal group-active:bg-teal-900",
                    isRow
                      ? "h-9 w-[3px] group-hover:scale-y-110"
                      : "w-9 h-[3px] group-hover:scale-x-110",
                  ].join(" ")}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
