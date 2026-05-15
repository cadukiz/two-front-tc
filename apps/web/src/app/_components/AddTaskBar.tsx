"use client";

/**
 * `AddTaskBar` — ported `.jsx → .tsx`, Tailwind-only (ADR-0007). The design's
 * `.add-bar` / `.btn-primary` / `.add-bar__err` CSS classes are re-expressed as
 * utilities against the Wave-5 tokens; no bespoke CSS.
 *
 * Reconciliation strategy (documented per spec): **pure SSE, no optimistic
 * temp row.** The store creates the task synchronously on `POST /api/tasks`
 * and the `task.created` / `email.created` SSE frames arrive ~immediately
 * (same in-process store). Inserting a client temp row with a parallel
 * non-domain id and swapping it would add flicker + an id-mapping concern for
 * no real latency win on a local round-trip. So: submit → POST →
 * Zod-parse `CreateTaskResponse`; on success clear the input + keep focus and
 * let SSE deliver the authoritative row (`liveReducer` dedupes by id). On a
 * 400 (server rejects empty/oversized — it validates too) or a network error,
 * surface an error toast and keep the typed text (nothing was optimistically
 * inserted, so there is nothing to roll back).
 */
import { useRef, useState } from "react";
import {
  CreateTaskResponseSchema,
  type CreateTaskResponse,
} from "@twofront/domain";
import { IPlus } from "../components/icons";

interface AddTaskBarProps {
  /** Surface an error toast (wired by `Workbench` to the toast host). */
  onError: (message: string) => void;
}

export function AddTaskBar({ onError }: AddTaskBarProps) {
  const [val, setVal] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const ref = useRef<HTMLInputElement>(null);

  const submit = async (): Promise<void> => {
    const v = val.trim();
    if (!v) {
      // Client-side reject (the server rejects too — this just avoids a round-trip).
      setErr("Enter a task title");
      ref.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: v }),
      });
      if (!res.ok) {
        // Server-authoritative rejection (400 etc.) → toast, keep the text.
        onError("Could not add task — the server rejected it.");
        ref.current?.focus();
        return;
      }
      const body: unknown = await res.json();
      // Parse-validate against the contract; a malformed 2xx is still an error.
      const parsed: CreateTaskResponse =
        CreateTaskResponseSchema.parse(body);
      void parsed; // the authoritative row arrives via SSE; nothing to apply here
      setVal("");
      setErr("");
      ref.current?.focus();
    } catch {
      onError("Could not add task — connection problem.");
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !val.trim();

  return (
    <>
      <form
        className={`sticky top-0 z-[4] flex gap-[10px] border-b bg-transparent px-[18px] pb-3 pt-[14px] ${
          err
            ? "border-b-[rgba(60,40,20,0.14)]"
            : "border-b-[rgba(60,40,20,0.14)]"
        }`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={ref}
          className={`min-w-0 flex-1 rounded-row border bg-panel px-[14px] py-[10px] text-[14.5px] text-ink-1 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4 ${
            err
              ? "border-rust shadow-[0_0_0_3px_rgba(176,82,54,0.12)]"
              : "border-[rgba(60,40,20,0.18)] focus:border-teal focus:shadow-[0_0_0_3px_rgba(15,93,74,0.12)]"
          }`}
          placeholder="Add a task…"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            if (err) setErr("");
          }}
          aria-label="New task title"
        />
        <button
          type="submit"
          className="inline-flex flex-none items-center gap-[6px] whitespace-nowrap rounded-pill bg-teal px-4 py-[10px] text-[13.5px] font-medium tracking-[0.01em] text-[#FBF6E8] transition-[background,transform] duration-150 hover:bg-teal-900 active:translate-y-px disabled:cursor-not-allowed disabled:bg-tan-deep disabled:opacity-60 motion-reduce:transition-none"
          disabled={disabled}
          aria-label="Add task"
        >
          <IPlus className="h-[13px] w-[13px]" /> Add task
        </button>
      </form>
      {err && (
        <div
          role="alert"
          className="-mt-px border-b border-b-[rgba(60,40,20,0.14)] bg-transparent px-[18px] pb-[10px] text-[11.5px] text-rust"
        >
          {err}
        </div>
      )}
    </>
  );
}
