/**
 * Wave 2 / Wave 10 — the in-memory store: the single stateful module and spine
 * of the mocked server. Holds tasks/emails/sms, a single monotonic `seq`, the
 * Fibonacci reset-cycle counter, the **mutable runtime config** (ADR-0009), and
 * a pub/sub for SSE deltas. All ordering is by `seq` (ADR-0006); feeds are
 * bounded to the last 200 records (ADR-0006 D7).
 *
 * Types & schemas come from `@twofront/domain` — never redefined here.
 */
import {
  TaskSchema,
  type Task,
  EmailSchema,
  type Email,
  SmsSchema,
  type Sms,
  SnapshotSchema,
  type Snapshot,
  SseEventSchema,
  type SseEvent,
  CreateTaskRequestSchema,
  RuntimeConfigSchema,
  resolveConfig,
  toRuntimeConfig,
  type Config,
  type RuntimeConfig,
  type PatchConfigRequest,
} from "@twofront/domain";
import { NotFoundError, ValidationError } from "./errors";

/** Max records retained per feed — memory stays bounded (ADR-0006 D7). */
const FEED_CAP = 200;

export interface Store {
  /**
   * The internal/test-only ms-per-minute (ADR-0009). Read by the scheduler to
   * size its `setInterval`. NOT user-facing and NOT in `snapshot().config`.
   */
  readonly tickMs: number;
  addTask(title: string): { task: Task; email: Email };
  completeTask(id: string): { task: Task };
  appendSummaryEmail(): Email;
  appendSms(args: { fibIndex: number; fibMinute: number }): Sms;
  bumpFibCycle(): void;
  getFibCycle(): number;
  /** The current user-facing runtime cadence config (ADR-0009). */
  getRuntimeConfig(): RuntimeConfig;
  /**
   * Apply a partial runtime-config change (ADR-0009). Clamps/validates via the
   * domain schema, updates state, notifies the scheduler to recompute, then
   * broadcasts a `config.updated` SSE frame. Returns the full new config.
   * Accepts the domain `PatchConfigRequest` (any non-empty subset).
   */
  setRuntimeConfig(patch: PatchConfigRequest): RuntimeConfig;
  /**
   * Register the scheduler's recompute hook (ADR-0009). Called once when the
   * scheduler is built; invoked synchronously inside `setRuntimeConfig` BEFORE
   * the `config.updated` broadcast so the new cadence is already in effect.
   */
  setConfigChangeHandler(fn: (cfg: RuntimeConfig) => void): void;
  snapshot(): Snapshot;
  subscribe(fn: (e: SseEvent) => void): () => void;
  /**
   * Test-only probe: the *internal* (pre-`snapshot()`-slice) array lengths.
   * Proves on-push eviction keeps memory bounded independently of the
   * newest-first slice in `snapshot()` (ADR-0006 D7). Not used at runtime.
   */
  __internalFeedLengths(): { tasks: number; emails: number; sms: number };
}

/**
 * Pure, deterministic store factory — no env or global access. Tests inject a
 * `Config` literal so they never touch `process.env`.
 */
export function createStore(config: Config): Store {
  const tasks: Task[] = [];
  const emails: Email[] = [];
  const sms: Sms[] = [];
  const listeners = new Set<(e: SseEvent) => void>();

  // Mutable runtime config (ADR-0009). `tickMs` is fixed for the process life
  // (test-only lever); the three user-facing ints mutate via setRuntimeConfig.
  const tickMs = config.tickMs;
  let runtime: RuntimeConfig = toRuntimeConfig(config);
  let onConfigChange: ((cfg: RuntimeConfig) => void) | undefined;

  let seq = 0;
  let lastSeq = 0;
  let fibCycle = 0;

  const nextSeq = (): number => {
    seq += 1;
    lastSeq = seq;
    return seq;
  };

  /** Keep only the newest `FEED_CAP` records (highest seq) so memory is bounded. */
  const cap = <T extends { seq: number }>(feed: T[]): void => {
    if (feed.length > FEED_CAP) {
      feed.splice(0, feed.length - FEED_CAP);
    }
  };

  const emit = (event: SseEvent): void => {
    SseEventSchema.parse(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        // A throwing listener must not break others or the mutation.
      }
    }
  };

  const pendingTasks = (): { id: string; title: string }[] =>
    tasks
      .filter((t) => t.status === "pending")
      .map((t) => ({ id: t.id, title: t.title }));

  const pendingTitleList = (): string[] =>
    tasks.filter((t) => t.status === "pending").map((t) => t.title);

  const renderList = (titles: string[]): string =>
    titles.length === 0
      ? "No pending tasks."
      : titles.map((t) => `- ${t}`).join("\n");

  return {
    tickMs,
    addTask(rawTitle: string): { task: Task; email: Email } {
      const parsed = CreateTaskRequestSchema.safeParse({ title: rawTitle });
      if (!parsed.success) {
        throw new ValidationError("Task title must be 1–500 characters.");
      }
      const title = parsed.data.title;

      const task: Task = {
        id: crypto.randomUUID(),
        seq: nextSeq(),
        title,
        status: "pending",
        createdAt: Date.now(),
        completedAt: null,
      };
      tasks.push(task);
      cap(tasks);

      const email: Email = {
        id: crypto.randomUUID(),
        seq: nextSeq(),
        kind: "immediate",
        subject: `New task: "${title}"`,
        body: `A new task "${title}" was created.\nUse this email's action link to mark it complete.`,
        taskId: task.id,
        pending: null,
        createdAt: Date.now(),
      };
      emails.push(email);
      cap(emails);

      // Defensive: fail loud if contract drift ever makes these invalid.
      TaskSchema.parse(task);
      EmailSchema.parse(email);

      emit({ type: "task.created", seq: task.seq, data: task });
      emit({ type: "email.created", seq: email.seq, data: email });

      return { task, email };
    },

    completeTask(id: string): { task: Task } {
      const task = tasks.find((t) => t.id === id);
      if (task === undefined) {
        throw new NotFoundError(`Task ${id} not found.`);
      }
      if (task.status === "completed") {
        // Idempotent no-op: no seq bump, no event (ADR-0006 D4).
        return { task };
      }
      task.status = "completed";
      task.completedAt = Date.now();
      task.seq = nextSeq();
      emit({ type: "task.completed", seq: task.seq, data: task });
      return { task };
    },

    appendSummaryEmail(): Email {
      const pending = pendingTasks();
      const email: Email = {
        id: crypto.randomUUID(),
        seq: nextSeq(),
        kind: "summary",
        subject: "Pending tasks summary",
        body: `Pending tasks summary:\n${renderList(pending.map((t) => t.title))}`,
        taskId: null,
        pending,
        createdAt: Date.now(),
      };
      emails.push(email);
      cap(emails);
      EmailSchema.parse(email);
      emit({ type: "email.created", seq: email.seq, data: email });
      return email;
    },

    appendSms(args: { fibIndex: number; fibMinute: number }): Sms {
      const titles = pendingTitleList();
      const record: Sms = {
        id: crypto.randomUUID(),
        seq: nextSeq(),
        body: `Pending tasks:\n${renderList(titles)}`,
        pendingTitles: titles,
        fibCycle,
        fibIndex: args.fibIndex,
        fibMinute: args.fibMinute,
        createdAt: Date.now(),
      };
      sms.push(record);
      cap(sms);
      SmsSchema.parse(record);
      emit({ type: "sms.created", seq: record.seq, data: record });
      return record;
    },

    bumpFibCycle(): void {
      fibCycle += 1;
    },

    getFibCycle(): number {
      return fibCycle;
    },

    getRuntimeConfig(): RuntimeConfig {
      return runtime;
    },

    setConfigChangeHandler(fn: (cfg: RuntimeConfig) => void): void {
      onConfigChange = fn;
    },

    setRuntimeConfig(patch: PatchConfigRequest): RuntimeConfig {
      // Merge then re-validate the whole config so out-of-range values are
      // rejected (the route maps the ZodError → 400 bad_request). Zod's parsed
      // partial omits absent keys (it never sets them to `undefined`), so the
      // spread cleanly overrides only the provided fields.
      const next = RuntimeConfigSchema.parse({ ...runtime, ...patch });
      runtime = next;
      // Scheduler recomputes synchronously FIRST so the new cadence is already
      // in effect before any client sees the broadcast (ADR-0009).
      onConfigChange?.(next);
      emit({ type: "config.updated", seq: nextSeq(), data: next });
      return next;
    },

    snapshot(): Snapshot {
      const newestFirst = <T extends { seq: number }>(feed: T[]): T[] =>
        [...feed].sort((a, b) => b.seq - a.seq).slice(0, FEED_CAP);

      const snap: Snapshot = {
        tasks: newestFirst(tasks),
        emails: newestFirst(emails),
        sms: newestFirst(sms),
        lastSeq,
        config: runtime,
      };
      SnapshotSchema.parse(snap);
      return snap;
    },

    subscribe(fn: (e: SseEvent) => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    __internalFeedLengths(): { tasks: number; emails: number; sms: number } {
      return { tasks: tasks.length, emails: emails.length, sms: sms.length };
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __twofront: Store | undefined;
}

/**
 * Lazily-initialized `globalThis` singleton. Survives Next dev hot-reload
 * (same module-eval reuses the global), so the scheduler and SSE clients all
 * see one store. Config is resolved from `process.env` exactly once.
 */
export function getStore(): Store {
  globalThis.__twofront ??= createStore(resolveConfig(process.env));
  return globalThis.__twofront;
}
