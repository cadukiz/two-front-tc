# @twofront/domain — the contract

**Single source of truth (ADR-0006).** The web app and Playwright E2E import inferred types from here. Do not define these types anywhere else.

```ts
import {
  TaskSchema, type Task,
  EmailSchema, type Email,
  SmsSchema, type Sms,
  SnapshotSchema, type Snapshot,
  SseEventSchema, type SseEvent,
  CreateTaskRequestSchema, CreateTaskResponseSchema,
  CompleteTaskParamsSchema, CompleteTaskResponseSchema,
  PatchConfigRequestSchema, type PatchConfigRequest,
  ApiErrorSchema,
  resolveConfig, toRuntimeConfig, minutesToMs, MINUTES_PER_DAY,
  ConfigSchema, type Config,
  RuntimeConfigSchema, type RuntimeConfig,
  fibonacciMinutes, fibonacciBig, fibonacciIntervals,
} from "@twofront/domain";
```

## Entities & fields (for mapping the frontend)

| Entity | Fields |
|---|---|
| **Task** (`task.ts`) | `id` · `seq` (ordering key) · `title` · `status` `"pending"\|"completed"` · `createdAt` (epoch ms, display only — drives "time age") · `completedAt` (epoch ms\|null) |
| **Email** (`email.ts`) | `id` · `seq` · `kind` `"immediate"\|"summary"` · `subject` · `body` · `taskId` (uuid\|null — set iff immediate; drives the "Mark complete" link) · `pendingTitles` (string[]\|null — set iff summary; may be empty) · `createdAt` |
| **Sms** (`sms.ts`) | `id` · `seq` · `body` · `pendingTitles` (string[]) · `fibCycle` (advances every `fibonacciResetDays` days) · `fibIndex` (1-based pos in cycle) · `fibMinute` (= `F(fibIndex) × smsBaseIntervalMinutes`, the gap used) · `createdAt` |
| **Snapshot** (`snapshot.ts`) | `tasks[]` · `emails[]` · `sms[]` · `lastSeq` (reconnect dedupe) · `config` (the 3 user-facing ints — `RuntimeConfig`, NOT `tickMs`) |
| **SseEvent** (`events.ts`) | discriminated union on `type`: `snapshot` \| `task.created` \| `task.completed` \| `email.created` \| `sms.created` \| `config.updated`; each carries `seq` + `data` |

## Endpoints (the entire backend)

| Method | Path | Returns |
|---|---|---|
| `POST` | `/api/tasks` | `CreateTaskResponse` (`{ task, email }` — immediate email created synchronously) |
| `POST` | `/api/tasks/:id/complete` | `CompleteTaskResponse` (idempotent) |
| `GET`  | `/api/tasks/:id/complete` | email-link adapter — same complete fn, confirmation page |
| `GET`  | `/api/state` | `Snapshot` |
| `GET`  | `/api/stream` | `text/event-stream` — `snapshot` then deltas |
| `GET`  | `/api/config` | current `RuntimeConfig` |
| `PATCH`| `/api/config` | mutate runtime cadence (`PatchConfigRequest`) → full new `RuntimeConfig` (ADR-0009) |

## Behavior fixed by decisions

- Ordering is by `seq`, never by `createdAt` (ADR-0006).
- Fibonacci values are the **gaps** between SMS sends; the gap minutes = `F(k) × smsBaseIntervalMinutes` (ADR-0009; at the default base 1 sends land at cumulative minutes 1, 2, 4, 7, 12, 20…).
- The summary email fires every `emailSummaryIntervalMinutes` (default 1 ⇒ every minute), **even with zero pending tasks** (`pendingTitles: []`).
- The three user-facing cadence settings are **runtime-mutable** via `PATCH /api/config`, each an int **1–100** (ADR-0009): `emailSummaryIntervalMinutes` (env `EMAIL_SUMMARY_INTERVAL_MINUTES`, default 1), `smsBaseIntervalMinutes` (env `SMS_BASE_INTERVAL_MINUTES`, default 1), `fibonacciResetDays` (env `FIBONACCI_RESET_DAYS`, default 1; 1 day = 1440 minutes). A `config.updated` SSE frame broadcasts changes; `Snapshot.config` is this `RuntimeConfig`.
- `TICK_MS` (ms per minute) is **internal / test-only** (E2E time-compression): not user-facing, not in `Snapshot.config`, not in `PATCH`. 60 000 for demo, default if unset.
