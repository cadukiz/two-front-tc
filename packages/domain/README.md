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
  ApiErrorSchema,
  resolveConfig, minutesToMs, ConfigSchema, type Config,
  fibonacciMinutes, fibonacciBig, fibonacciIntervals,
} from "@twofront/domain";
```

## Entities & fields (for mapping the frontend)

| Entity | Fields |
|---|---|
| **Task** (`task.ts`) | `id` · `seq` (ordering key) · `title` · `status` `"pending"\|"completed"` · `createdAt` (epoch ms, display only — drives "time age") · `completedAt` (epoch ms\|null) |
| **Email** (`email.ts`) | `id` · `seq` · `kind` `"immediate"\|"summary"` · `subject` · `body` · `taskId` (uuid\|null — set iff immediate; drives the "Mark complete" link) · `pendingTitles` (string[]\|null — set iff summary; may be empty) · `emailCycle` (advances every `emailResetMinutes`) · `createdAt` |
| **Sms** (`sms.ts`) | `id` · `seq` · `body` · `pendingTitles` (string[]) · `fibCycle` (advances every `fibonacciResetMinutes`) · `fibIndex` (1-based pos in cycle) · `fibMinute` (= F(fibIndex), the gap used) · `createdAt` |
| **Snapshot** (`snapshot.ts`) | `tasks[]` · `emails[]` · `sms[]` · `lastSeq` (reconnect dedupe) · `config` |
| **SseEvent** (`events.ts`) | discriminated union on `type`: `snapshot` \| `task.created` \| `task.completed` \| `email.created` \| `sms.created`; each carries `seq` + `data` |

## Endpoints (the entire backend)

| Method | Path | Returns |
|---|---|---|
| `POST` | `/api/tasks` | `CreateTaskResponse` (`{ task, email }` — immediate email created synchronously) |
| `POST` | `/api/tasks/:id/complete` | `CompleteTaskResponse` (idempotent) |
| `GET`  | `/api/tasks/:id/complete` | email-link adapter — same complete fn, confirmation page |
| `GET`  | `/api/state` | `Snapshot` |
| `GET`  | `/api/stream` | `text/event-stream` — `snapshot` then deltas |

## Behavior fixed by decisions

- Ordering is by `seq`, never by `createdAt` (ADR-0006).
- Fibonacci values are the **gaps** between SMS sends; sends land at cumulative minutes 1, 2, 4, 7, 12, 20… (ADR-0004).
- The 1-minute summary email **fires even with zero pending tasks** (`pendingTitles: []`).
- Reset windows are configurable in **simulated minutes, 1–100** (`FIBONACCI_RESET_MINUTES`, `EMAIL_RESET_MINUTES`); `cycle` fields make resets observable in E2E.
- One simulated minute = `TICK_MS` ms — compress for tests, 60 000 for demo.
