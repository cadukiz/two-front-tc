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
import type { Email } from "@twofront/domain";
import { EmailCard } from "./EmailCard";

/**
 * Wave 6.2 — EmailCard tests. Real behavior: an immediate email whose task is
 * still pending shows "Mark complete" which hits the GET email-link adapter
 * (`GET /api/tasks/:id/complete`); once the task is no longer pending the
 * action shows the disabled "Completed" state; a summary email with empty
 * `pendingTitles` renders the "no pending tasks" copy.
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openCard(): void {
  // The header strip is the first button; clicking it expands the body.
  const head = container.querySelector("button");
  if (!head) throw new Error("email header not found");
  act(() => {
    head.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const TASK_ID = "11111111-1111-1111-1111-111111111111";

const immediateEmail: Email = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  seq: 3,
  kind: "immediate",
  subject: "New task added — Buy milk",
  body: "A new task was just added to your queue.",
  taskId: TASK_ID,
  pendingTitles: null,
  createdAt: 1_700_000_000_000,
};

const summaryEmail: Email = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  seq: 4,
  kind: "summary",
  subject: "Pending tasks · summary",
  body: "",
  taskId: null,
  pendingTitles: [],
  createdAt: 1_700_000_000_000,
};

describe("EmailCard", () => {
  it("shows 'Mark complete' only when the referenced task is pending and hits the GET endpoint", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("<html>done</html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        taskStillPending={true}
        onError={onError}
      />,
    );
    openCard();
    expect(container.textContent).toContain("Mark complete");

    // Click the "Mark complete" action (last button in the card).
    const buttons = container.querySelectorAll("button");
    const action = buttons[buttons.length - 1];
    if (!action) throw new Error("action button not found");
    act(() => {
      action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/tasks/${TASK_ID}/complete`);
    expect(init.method).toBe("GET");
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the disabled 'Completed' state when the task is no longer pending", () => {
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        taskStillPending={false}
        onError={vi.fn()}
      />,
    );
    openCard();
    expect(container.textContent).toContain("Completed");
    expect(container.textContent).not.toContain("Mark complete");
    const buttons = container.querySelectorAll("button");
    const action = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(action.disabled).toBe(true);
  });

  it("renders the empty-pendingTitles 'no pending tasks' copy for a summary email", () => {
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        taskStillPending={false}
        onError={vi.fn()}
      />,
    );
    openCard();
    expect(container.textContent).toContain("No pending tasks at this time.");
    // A summary email has no task action.
    expect(container.textContent).not.toContain("Mark complete");
  });

  it("renders the Summary badge for summary emails and Immediate for immediate", () => {
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        taskStillPending={false}
        onError={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("Summary");
  });
});
