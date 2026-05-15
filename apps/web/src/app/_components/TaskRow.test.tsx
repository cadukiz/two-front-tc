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
import type { Task } from "@twofront/domain";
import { TaskRow, CompletedRow } from "./TaskRow";

/**
 * Wave 6.1 — TaskRow / CompletedRow tests. Real behavior: the pending row
 * renders a live age from `createdAt` vs the Workbench clock, the Complete
 * button POSTs to `/api/tasks/:id/complete`, and CompletedRow renders the
 * formatted `completedAt`.
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

const NOW = 1_700_000_000_000;

const pendingTask: Task = {
  id: "11111111-1111-1111-1111-111111111111",
  seq: 5,
  title: "Approve invoice batch",
  status: "pending",
  createdAt: NOW - 90_000, // 90s ago → "1m ago"
  completedAt: null,
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("TaskRow (pending)", () => {
  it("renders the title and a live age derived from createdAt vs now", () => {
    mount(
      <TaskRow
        task={pendingTask}
        now={NOW}
        fresh={false}
        onError={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("Approve invoice batch");
    expect(container.textContent).toContain("1m ago");
  });

  it("re-renders the age when the clock advances", () => {
    mount(
      <TaskRow
        task={pendingTask}
        now={NOW}
        fresh={false}
        onError={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("1m ago");
    act(() => {
      root.render(
        <TaskRow
          task={pendingTask}
          now={NOW + 120_000}
          fresh={false}
          onError={vi.fn()}
        />,
      );
    });
    expect(container.textContent).toContain("3m ago");
  });

  it("POSTs to /api/tasks/:id/complete when Complete is clicked", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ task: pendingTask }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(
      <TaskRow
        task={pendingTask}
        now={NOW}
        fresh={false}
        onError={onError}
      />,
    );

    const btn = container.querySelector("button");
    if (!btn) throw new Error("complete button not found");
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "/api/tasks/11111111-1111-1111-1111-111111111111/complete",
    );
    expect(init.method).toBe("POST");
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when the complete POST fails", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("nope", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(
      <TaskRow
        task={pendingTask}
        now={NOW}
        fresh={false}
        onError={onError}
      />,
    );
    const btn = container.querySelector("button");
    if (!btn) throw new Error("complete button not found");
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("CompletedRow", () => {
  it("renders the title and formatted completedAt", () => {
    const done: Task = {
      ...pendingTask,
      status: "completed",
      completedAt: NOW,
    };
    mount(<CompletedRow task={done} />);
    expect(container.textContent).toContain("Approve invoice batch");
    // formatDateTime → "Mon D, HH:MM:SS"; assert a stable substring
    const expected = new Date(NOW).toLocaleString("en-US", {
      month: "short",
    });
    expect(container.textContent).toContain(expected);
  });
});
