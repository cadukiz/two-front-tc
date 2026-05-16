import { describe, it, expect } from "vitest";
import { EmailSchema } from "./email";

/**
 * ADR-0010 — the `Email` summary payload carries pending `{ id, title }` pairs
 * (not bare `pendingTitles: string[]`), so each listed task is unambiguously
 * completable from the email action. `summary` → non-null `pending` (may be
 * `[]`, since empty summaries still fire — ADR-0004); `immediate` → `pending`
 * is `null` and `taskId` is set.
 */
const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";

describe("EmailSchema — pending {id,title}[] contract (ADR-0010)", () => {
  it("accepts a summary email with a non-empty pending {id,title}[]", () => {
    const parsed = EmailSchema.safeParse({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      seq: 4,
      kind: "summary",
      subject: "Pending tasks summary",
      body: "...",
      taskId: null,
      pending: [
        { id: ID_A, title: "Alpha" },
        { id: ID_B, title: "Beta" },
      ],
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pending).toEqual([
        { id: ID_A, title: "Alpha" },
        { id: ID_B, title: "Beta" },
      ]);
    }
  });

  it("accepts an empty summary (pending: []) — empty summaries still fire", () => {
    const parsed = EmailSchema.safeParse({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      seq: 4,
      kind: "summary",
      subject: "Pending tasks summary",
      body: "No pending tasks.",
      taskId: null,
      pending: [],
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.pending).toEqual([]);
  });

  it("accepts an immediate email with pending: null and a taskId", () => {
    const parsed = EmailSchema.safeParse({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      seq: 2,
      kind: "immediate",
      subject: 'New task: "Buy milk"',
      body: "...",
      taskId: ID_A,
      pending: null,
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pending).toBeNull();
      expect(parsed.data.taskId).toBe(ID_A);
    }
  });

  it("rejects a pending entry missing its id (title alone is not unique)", () => {
    const parsed = EmailSchema.safeParse({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      seq: 4,
      kind: "summary",
      subject: "Pending tasks summary",
      body: "...",
      taskId: null,
      pending: [{ title: "Alpha" }],
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-uuid pending id", () => {
    const parsed = EmailSchema.safeParse({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      seq: 4,
      kind: "summary",
      subject: "Pending tasks summary",
      body: "...",
      taskId: null,
      pending: [{ id: "not-a-uuid", title: "Alpha" }],
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(false);
  });

  it("still rejects the old bare pendingTitles field", () => {
    const parsed = EmailSchema.safeParse({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      seq: 4,
      kind: "summary",
      subject: "Pending tasks summary",
      body: "...",
      taskId: null,
      pendingTitles: ["Alpha"],
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(false);
  });
});
