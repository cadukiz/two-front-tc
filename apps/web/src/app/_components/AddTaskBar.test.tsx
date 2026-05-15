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
import { AddTaskBar } from "./AddTaskBar";

/**
 * Wave 6.1 — AddTaskBar interaction tests. Real behavior: empty/whitespace is
 * rejected client-side (no fetch), a valid submit POSTs to `/api/tasks` with
 * the right method/body, a server 400 surfaces an error toast, and a malformed
 * 2xx (fails the Zod contract) is treated as an error.
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

const validResponse = {
  task: {
    id: "11111111-1111-1111-1111-111111111111",
    seq: 1,
    title: "Buy milk",
    status: "pending",
    createdAt: 1_700_000_000_000,
    completedAt: null,
  },
  email: {
    id: "22222222-2222-2222-2222-222222222222",
    seq: 2,
    kind: "immediate",
    subject: "New task added — Buy milk",
    body: "A new task was just added.",
    taskId: "11111111-1111-1111-1111-111111111111",
    pendingTitles: null,
    emailCycle: 0,
    createdAt: 1_700_000_000_000,
  },
};

function input(): HTMLInputElement {
  const el = container.querySelector("input");
  if (!el) throw new Error("input not found");
  return el as HTMLInputElement;
}
function form(): HTMLFormElement {
  const el = container.querySelector("form");
  if (!el) throw new Error("form not found");
  return el as HTMLFormElement;
}

/**
 * Set a controlled input's value the way React expects: go through the native
 * value setter so React's `onChange` observes the change, then dispatch the
 * `input` event.
 */
function type(value: string): void {
  const el = input();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm(): Promise<void> {
  await act(async () => {
    form().dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    for (let i = 0; i < 12; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("AddTaskBar", () => {
  it("rejects an empty / whitespace title without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(<AddTaskBar onError={onError} />);

    type("   "); // whitespace-only
    await submitForm();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Enter a task title");
  });

  it("POSTs to /api/tasks with the trimmed title on submit", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponse), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(<AddTaskBar onError={onError} />);

    type("  Buy milk  ");
    await submitForm();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Buy milk" });
    expect(onError).not.toHaveBeenCalled();
    // input cleared on success
    expect(input().value).toBe("");
  });

  it("surfaces an error toast on a server 400", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "bad", code: "bad_request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(<AddTaskBar onError={onError} />);

    type("Anything");
    await submitForm();

    expect(onError).toHaveBeenCalledTimes(1);
    // text NOT cleared (nothing optimistically inserted to roll back)
    expect(input().value).toBe("Anything");
  });

  it("treats a malformed 2xx body (fails the Zod contract) as an error", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ nope: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(<AddTaskBar onError={onError} />);

    type("Valid title");
    await submitForm();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
