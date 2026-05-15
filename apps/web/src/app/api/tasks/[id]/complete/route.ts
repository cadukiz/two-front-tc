/**
 * Wave 4 — `POST` and `GET` `/api/tasks/:id/complete`.
 *
 * Both verbs perform the SAME idempotent domain mutation (ADR-0006 D4 — a
 * re-complete is a no-op, no duplicate event); they differ only in
 * presentation:
 *  - `POST` → JSON `CompleteTaskResponse` (the in-app UI calls this).
 *  - `GET`  → a tiny self-contained HTML page so the *email action link*
 *            round-trip works from a plain mail client (ADR-0002 / brief B2).
 *
 * Next 15 App Router: the 2nd handler arg's `params` is a Promise.
 * Types/schemas come from `@twofront/domain`; nothing is redefined here.
 */
import {
  CompleteTaskParamsSchema,
  CompleteTaskResponseSchema,
} from "@twofront/domain";
import { getStore } from "../../../../../server/store";
import { NotFoundError } from "../../../../../server/errors";
import { json, handleError } from "../../../_lib/respond";

type Ctx = { params: Promise<{ id: string }> };

/** Escape interpolated text so a task title can't break the HTML page. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(title: string, body: string, status: number): Response {
  const doc = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">
${body}
<p><a href="/">Back to TwoFront</a></p>
</body>
</html>`;
  return new Response(doc, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** POST → JSON response (used by the in-app UI). */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const parsed = CompleteTaskParamsSchema.parse({ id });
    const { task } = getStore().completeTask(parsed.id);
    return json(CompleteTaskResponseSchema.parse({ task }));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * GET → HTML confirmation (the email "mark complete" link target). Same
 * mutation as POST; errors are rendered as small HTML pages instead of the
 * JSON `ApiError` envelope so the link works in any mail client.
 */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const parsed = CompleteTaskParamsSchema.parse({ id });
    const { task } = getStore().completeTask(parsed.id);
    return htmlPage(
      "Task complete",
      `<h1>Done</h1><p>Task "<strong>${escapeHtml(
        task.title,
      )}</strong>" marked complete.</p>`,
      200,
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      return htmlPage(
        "Task not found",
        `<h1>Not found</h1><p>That task was not found.</p>`,
        404,
      );
    }
    // Bad/non-uuid id (ZodError) or anything else → a simple 400 page.
    return htmlPage(
      "Invalid request",
      `<h1>Invalid request</h1><p>That link is not valid.</p>`,
      400,
    );
  }
}
