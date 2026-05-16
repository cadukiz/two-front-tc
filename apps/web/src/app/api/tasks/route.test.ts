import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CreateTaskResponseSchema,
  ApiErrorSchema,
} from "@twofront/domain";
import { POST } from "./route";

/** Reset the globalThis store + scheduler singletons between tests. */
function resetSingletons(): void {
  const g = globalThis as {
    __twofront_scheduler?: { stop(): void };
    __twofront?: unknown;
  };
  g.__twofront_scheduler?.stop();
  delete g.__twofront_scheduler;
  delete g.__twofront;
}

beforeEach(() => {
  process.env.TICK_MS = "60";
  // ADR-0009: cadence vars all default; clear them for isolation.
  delete process.env.EMAIL_SUMMARY_INTERVAL_MINUTES;
  delete process.env.SMS_BASE_INTERVAL_MINUTES;
  delete process.env.FIBONACCI_RESET_DAYS;
  resetSingletons();
});

afterEach(() => {
  resetSingletons();
});

function postReq(body: string): Request {
  return new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/tasks", () => {
  it("creates a task + immediate email and returns 201", async () => {
    const res = await POST(postReq(JSON.stringify({ title: "Buy milk" })));
    expect(res.status).toBe(201);

    const body: unknown = await res.json();
    const parsed = CreateTaskResponseSchema.parse(body);

    expect(parsed.task.title).toBe("Buy milk");
    expect(parsed.task.status).toBe("pending");
    expect(parsed.task.completedAt).toBeNull();

    expect(parsed.email.kind).toBe("immediate");
    expect(parsed.email.taskId).toBe(parsed.task.id);
    expect(parsed.email.subject).toContain("Buy milk");
  });

  it("trims the title before storing", async () => {
    const res = await POST(postReq(JSON.stringify({ title: "  Spaced  " })));
    expect(res.status).toBe(201);
    const body = CreateTaskResponseSchema.parse(await res.json());
    expect(body.task.title).toBe("Spaced");
  });

  it("rejects an empty title with 400 bad_request", async () => {
    const res = await POST(postReq(JSON.stringify({ title: "" })));
    expect(res.status).toBe(400);
    const body = ApiErrorSchema.parse(await res.json());
    expect(body.code).toBe("bad_request");
  });

  it("rejects a whitespace-only title with 400 bad_request", async () => {
    const res = await POST(postReq(JSON.stringify({ title: "   " })));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });

  it("rejects a missing title with 400 bad_request", async () => {
    const res = await POST(postReq(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });

  it("rejects malformed JSON with 400 bad_request", async () => {
    const res = await POST(postReq("{not json"));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });
});
