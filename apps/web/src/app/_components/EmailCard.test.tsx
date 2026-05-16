import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  vi,
} from "vitest";
import { act, useCallback, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Email } from "@twofront/domain";
import { EmailCard } from "./EmailCard";

/**
 * Wave 11 / ADR-0010 — EmailCard tests. **Every** notification email is
 * actionable and the complete control is visible WITHOUT expanding the card
 * (RC1 + RC2 fixes):
 *  - `immediate`: a "Mark complete" control for `email.taskId` that hits the
 *    GET email-link adapter `GET /api/tasks/:id/complete`; once the task is no
 *    longer pending it shows a disabled "Completed" state. Visible collapsed.
 *  - `summary`: a per-pending-entry complete control (one per `email.pending`
 *    item) that GETs the right id; entries whose task is already completed show
 *    a disabled "Completed" state (the round-trip is visibly validated). An
 *    empty `pending` renders the "no pending tasks" empty state. Visible
 *    collapsed.
 *  - No optimistic mutation: state only changes when the live `pendingTaskIds`
 *    prop changes (server-authoritative via SSE).
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

function rerender(node: React.ReactElement): void {
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

function buttonByLabel(label: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!el) throw new Error(`button [aria-label="${label}"] not found`);
  return el;
}

const TASK_ID = "11111111-1111-1111-1111-111111111111";
const TASK_A = "aaaaaaaa-1111-1111-1111-111111111111";
const TASK_B = "bbbbbbbb-2222-2222-2222-222222222222";

const immediateEmail: Email = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  seq: 3,
  kind: "immediate",
  subject: "New task added — Buy milk",
  body: "A new task was just added to your queue.",
  taskId: TASK_ID,
  pending: null,
  createdAt: 1_700_000_000_000,
};

const summaryEmail: Email = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  seq: 4,
  kind: "summary",
  subject: "Pending tasks · summary",
  body: "Pending tasks summary:\n- Alpha\n- Beta",
  taskId: null,
  pending: [
    { id: TASK_A, title: "Alpha" },
    { id: TASK_B, title: "Beta" },
  ],
  createdAt: 1_700_000_000_000,
};

const emptySummaryEmail: Email = {
  ...summaryEmail,
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  body: "Pending tasks summary:\nNo pending tasks.",
  pending: [],
};

describe("EmailCard — immediate (RC1+RC2: visible without expanding)", () => {
  it("renders the 'Mark complete' action in the COLLAPSED card (no expand needed)", () => {
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_ID])}
        onError={vi.fn()}
      />,
    );
    // The header toggle starts collapsed (aria-expanded=false) — assert the
    // action is in the DOM WITHOUT clicking anything (RC1 regression guard).
    const head = container.querySelector("button[aria-expanded]");
    expect(head?.getAttribute("aria-expanded")).toBe("false");
    expect(
      buttonByLabel("Mark complete: New task added — Buy milk"),
    ).toBeTruthy();
  });

  it("hits the GET email-link adapter for email.taskId (exact URL, method GET)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("<html>done</html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const onError = vi.fn();
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_ID])}
        onError={onError}
      />,
    );
    const action = buttonByLabel("Mark complete: New task added — Buy milk");
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

  it("shows a disabled 'Completed' state when the task is no longer pending", () => {
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={new Set()}
        onError={vi.fn()}
      />,
    );
    const done = buttonByLabel("Completed: New task added — Buy milk");
    expect(done.disabled).toBe(true);
    expect(container.querySelector('button[aria-label^="Mark complete"]')).toBe(
      null,
    );
  });

  it("flips to 'Completed' only when the live pendingTaskIds prop drops it (no optimistic mutation)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("<html>done</html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    mount(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_ID])}
        onError={vi.fn()}
      />,
    );
    const action = buttonByLabel("Mark complete: New task added — Buy milk");
    act(() => {
      action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    // Still "Mark complete" — clicking does NOT optimistically flip the state.
    expect(
      container.querySelector('button[aria-label^="Mark complete"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('button[aria-label^="Completed:"]'),
    ).toBe(null);

    // The server-authoritative SSE reflection arrives via the prop.
    rerender(
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={new Set()}
        onError={vi.fn()}
      />,
    );
    expect(
      buttonByLabel("Completed: New task added — Buy milk").disabled,
    ).toBe(true);
  });
});

describe("EmailCard — summary (RC2: per-pending-task complete)", () => {
  it("renders a per-entry 'Mark complete' for EACH pending task in the COLLAPSED card", () => {
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_A, TASK_B])}
        onError={vi.fn()}
      />,
    );
    const head = container.querySelector("button[aria-expanded]");
    expect(head?.getAttribute("aria-expanded")).toBe("false");
    expect(buttonByLabel("Mark complete: Alpha")).toBeTruthy();
    expect(buttonByLabel("Mark complete: Beta")).toBeTruthy();
  });

  it("each per-entry control GETs its own task id (exact URL, method GET)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response("<html>done</html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_A, TASK_B])}
        onError={vi.fn()}
      />,
    );
    act(() => {
      buttonByLabel("Mark complete: Beta").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/tasks/${TASK_B}/complete`);
    expect(init.method).toBe("GET");
  });

  it("an already-completed entry shows a disabled 'Completed' state (round-trip visible)", () => {
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        // Alpha completed (not in pending set), Beta still pending.
        pendingTaskIds={new Set([TASK_B])}
        onError={vi.fn()}
      />,
    );
    expect(buttonByLabel("Completed: Alpha").disabled).toBe(true);
    expect(buttonByLabel("Mark complete: Beta")).toBeTruthy();
  });

  it("renders the empty-state copy for a summary email with no pending tasks", () => {
    mount(
      <EmailCard
        email={emptySummaryEmail}
        fresh={false}
        pendingTaskIds={new Set()}
        onError={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("No pending tasks at this time.");
    expect(container.querySelector('button[aria-label^="Mark complete"]')).toBe(
      null,
    );
  });

  it("renders the Summary badge for summary emails", () => {
    mount(
      <EmailCard
        email={summaryEmail}
        fresh={false}
        pendingTaskIds={new Set([TASK_A, TASK_B])}
        onError={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("Summary");
  });
});

/**
 * Wave 12 — REGRESSION GUARD for the "Mark complete" per-second blink.
 *
 * Root cause (now fixed): `EmailCard` rendered an inline `TaskAction`
 * component defined *inside its render*, so every `EmailCard` re-render
 * created a new component identity → React UNMOUNTED + remounted the button.
 * The Workbench's 1-second `now` clock re-rendered the un-memoized cards every
 * second, so the hovered button blinked once a second.
 *
 * This harness mirrors how the Workbench passes props: a parent holds an
 * unrelated `now` state (the 1 s clock) plus referentially-stable `EmailCard`
 * props (a `useMemo` pending set + a `useCallback` `onError`, neither derived
 * from `now`). It captures the live "Mark complete" DOM node, bumps ONLY the
 * parent's `now`, and asserts the button is the *same DOM node* (not
 * remounted) — strictly stronger than a render-count probe.
 *
 * On the OLD code this FAILS: an inline `TaskAction` plus an un-memoized
 * `EmailCard` ⇒ the parent `now` bump re-renders `EmailCard` and re-creates
 * `TaskAction`'s identity ⇒ React replaces the button with a NEW DOM node, so
 * the `toBe` node-identity assertion (and the render-count probe) both fail.
 * After the fix (`memo(EmailCard)` + module-level stable `TaskAction`) a
 * `now`-only change does not re-render `EmailCard` at all → node is stable.
 */
let bumpNow: (() => void) | undefined;
function NowHarness(): React.ReactElement {
  // The Workbench's 1-second clock — UNRELATED to the email feed.
  const [now, setNow] = useState<number>(1_700_000_000_000);
  bumpNow = () => setNow((n) => n + 1000);
  // Referentially stable across a `now` tick — exactly like Workbench, where
  // `pendingIds` is `useMemo`(tasks) and `pushToast` is `useCallback`. With
  // `EmailCard` `memo`'d and these props stable, a `now`-only change must NOT
  // re-render `EmailCard` (so its DOM is untouched and the button stable).
  const pendingTaskIds = useMemo(() => new Set([TASK_ID]), []);
  const onError = useCallback(() => {}, []);
  return (
    <div>
      <span data-testid="now">{now}</span>
      <EmailCard
        email={immediateEmail}
        fresh={false}
        pendingTaskIds={pendingTaskIds}
        onError={onError}
      />
    </div>
  );
}

describe("EmailCard — regression: a `now` tick must not remount the button", () => {
  it("keeps the SAME 'Mark complete' (and article) DOM node across a parent `now` change", () => {
    mount(<NowHarness />);

    const labelSel = "Mark complete: New task added — Buy milk";
    const btnBefore = buttonByLabel(labelSel);
    const articleBefore = container.querySelector("article");
    expect(articleBefore).not.toBeNull();

    // Bump ONLY the unrelated `now` state (simulating the 1 s clock tick).
    act(() => {
      bumpNow!();
    });

    const btnAfter = buttonByLabel(labelSel);
    const articleAfter = container.querySelector("article");

    // The button must be the EXACT same DOM node — NOT unmounted/remounted.
    // OLD CODE FAILS HERE: an inline `TaskAction` defined inside EmailCard's
    // render + an un-memoized `EmailCard` ⇒ the `now` bump re-renders
    // `EmailCard`, re-creates `TaskAction`'s component identity, and React
    // replaces the button with a NEW DOM node ⇒ `btnAfter !== btnBefore`.
    // AFTER THE FIX: `memo(EmailCard)` + module-level stable `TaskAction` ⇒
    // a `now`-only change does not re-render `EmailCard` at all ⇒ same node.
    expect(btnAfter).toBe(btnBefore);
    // The whole card subtree is likewise stable (strengthens the guard).
    expect(articleAfter).toBe(articleBefore);
    // Sanity: the `now` state really did change (so the test is meaningful).
    expect(
      container.querySelector('[data-testid="now"]')?.textContent,
    ).toBe("1700000001000");
  });
});
