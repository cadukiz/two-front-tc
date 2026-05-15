import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ApiErrorSchema } from "@twofront/domain";
import { NotFoundError, ValidationError } from "../../../server/errors";
import { json, apiError, handleError } from "./respond";

describe("json", () => {
  it("serializes data with 200 by default", async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("honors a custom status from init", async () => {
    const res = json({ created: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 1 });
  });
});

describe("apiError", () => {
  it("maps bad_request to 400 with an ApiErrorSchema body", async () => {
    const res = apiError("bad_request", "bad input");
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    const parsed = ApiErrorSchema.parse(body);
    expect(parsed).toEqual({ error: "bad input", code: "bad_request" });
  });

  it("maps not_found to 404 with an ApiErrorSchema body", async () => {
    const res = apiError("not_found", "missing");
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expect(ApiErrorSchema.parse(body)).toEqual({
      error: "missing",
      code: "not_found",
    });
  });
});

describe("handleError", () => {
  it("maps ValidationError → 400 bad_request", async () => {
    const res = handleError(new ValidationError("title too short"));
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expect(ApiErrorSchema.parse(body)).toEqual({
      error: "title too short",
      code: "bad_request",
    });
  });

  it("maps a ZodError → 400 bad_request with a flattened message", async () => {
    const schema = z.object({ title: z.string().min(1) });
    let zerr: unknown;
    try {
      schema.parse({ title: "" });
    } catch (e) {
      zerr = e;
    }
    const res = handleError(zerr);
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    const parsed = ApiErrorSchema.parse(body);
    expect(parsed.code).toBe("bad_request");
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("maps NotFoundError → 404 not_found", async () => {
    const res = handleError(new NotFoundError("task X not found"));
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expect(ApiErrorSchema.parse(body)).toEqual({
      error: "task X not found",
      code: "not_found",
    });
  });

  it("maps an unknown error → 500 with a non-ApiError internal body", async () => {
    const res = handleError(new Error("boom"));
    expect(res.status).toBe(500);
    const body: unknown = await res.json();
    expect(body).toEqual({ error: "Internal error" });
    expect(ApiErrorSchema.safeParse(body).success).toBe(false);
  });

  it("maps a thrown non-Error value → 500 internal", async () => {
    const res = handleError("a string was thrown");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
