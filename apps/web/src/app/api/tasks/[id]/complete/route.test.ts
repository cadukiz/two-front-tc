import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CompleteTaskResponseSchema, ApiErrorSchema } from "@twofront/domain";
import { getStore } from "../../../../../server/store";
import { POST, GET } from "./route";

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
  process.env.FIBONACCI_RESET_MINUTES = "7";
  process.env.EMAIL_RESET_MINUTES = "7";
  resetSingletons();
});

afterEach(() => {
  resetSingletons();
});

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, id: string): Request {
  return new Request(`http://localhost/api/tasks/${id}/complete`, { method });
}

const UNKNOWN_UUID = "00000000-0000-0000-0000-000000000000";

describe("POST /api/tasks/[id]/complete", () => {
  it("completes a pending task and returns 200", async () => {
    const { task } = getStore().addTask("Complete me");
    const res = await POST(req("POST", task.id), ctx(task.id));
    expect(res.status).toBe(200);

    const body = CompleteTaskResponseSchema.parse(await res.json());
    expect(body.task.id).toBe(task.id);
    expect(body.task.status).toBe("completed");
    expect(body.task.completedAt).not.toBeNull();
  });

  it("is idempotent: completing twice still 200 + completed, no error", async () => {
    const { task } = getStore().addTask("Twice");
    const first = await POST(req("POST", task.id), ctx(task.id));
    expect(first.status).toBe(200);

    const second = await POST(req("POST", task.id), ctx(task.id));
    expect(second.status).toBe(200);
    const body = CompleteTaskResponseSchema.parse(await second.json());
    expect(body.task.status).toBe("completed");
  });

  it("returns 404 not_found for an unknown (well-formed) uuid", async () => {
    const res = await POST(req("POST", UNKNOWN_UUID), ctx(UNKNOWN_UUID));
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("not_found");
  });

  it("returns 400 bad_request for a non-uuid id", async () => {
    const res = await POST(req("POST", "not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(await res.json()).code).toBe("bad_request");
  });
});

describe("GET /api/tasks/[id]/complete (email action link)", () => {
  it("completes the task and returns a 200 html confirmation containing the title", async () => {
    const { task } = getStore().addTask("Click from email");
    const res = await GET(req("GET", task.id), ctx(task.id));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("Click from email");
    expect(html).toContain('href="/"');

    // The GET performs the same domain mutation as POST.
    const snap = getStore().snapshot();
    const stored = snap.tasks.find((t) => t.id === task.id);
    expect(stored?.status).toBe("completed");
  });

  it("is idempotent on GET as well", async () => {
    const { task } = getStore().addTask("Email twice");
    await GET(req("GET", task.id), ctx(task.id));
    const res = await GET(req("GET", task.id), ctx(task.id));
    expect(res.status).toBe(200);
    expect(getStore().snapshot().tasks[0]?.status).toBe("completed");
  });

  it("returns a 404 html page for an unknown uuid", async () => {
    const res = await GET(req("GET", UNKNOWN_UUID), ctx(UNKNOWN_UUID));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("not found");
  });

  it("returns a 400 html page for a non-uuid id", async () => {
    const res = await GET(req("GET", "bad"), ctx("bad"));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
