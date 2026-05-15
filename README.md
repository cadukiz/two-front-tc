# TwoFront

A single-page, real-time task manager with a **mocked server**. Add a task and
the server immediately "emails" you, then keeps a recurring **1-minute summary
email** and a **Fibonacci-cadence SMS** reminder flowing — all streamed live
over **SSE** into three always-visible panels (Tasks, Emails, SMS). Completing a
task in the app *or* from the email's action link reflects everywhere. The
server is authoritative: a single in-memory store + one scheduler is the only
source of truth, so the cadence is deterministic and the UI never guesses.

## Quick start

From this directory (`tc/`):

```bash
pnpm install
cp .env.example apps/web/.env      # defaults are demo-ready (TICK_MS=60000)
pnpm --filter web dev              # http://localhost:3000
```

Add a task: the immediate email appears instantly; the recurring summary email
and the first Fibonacci SMS land ~1 simulated minute later.

## Scripts

| Command | What it does |
|---|---|
| `pnpm -w build` | Turbo build of all packages |
| `pnpm -w test` | All unit + interaction tests (`@twofront/domain` + `web`) |
| `pnpm --filter web typecheck` | Strict `tsc --noEmit` |
| `pnpm --filter web lint` | `next lint` |
| `pnpm --filter e2e test` | Playwright POM E2E (bonuses B1 + B2), ~22–27 s |

The E2E package builds and starts the production server itself with a
compressed `TICK_MS` — no manual dev server needed for the E2E run.

## Environment variables

Copy `.env.example` to `apps/web/.env`. One scheduler tick = one *simulated
minute* = `TICK_MS` ms — this is what makes the recurring features both
brief-faithful and testable (ADR-0004).

| Var | Meaning | Default | Demo value |
|---|---|---|---|
| `TICK_MS` | Wall-clock ms per simulated minute | `60000` | **`60000`** (1 tick = 60 s, the brief's "every minute") |
| `FIBONACCI_RESET_MINUTES` | Every N sim-minutes the SMS Fibonacci sequence restarts (`fibCycle++`); int 1–100 | `7` | `7` |
| `EMAIL_RESET_MINUTES` | Every N sim-minutes the email `emailCycle` advances; the summary **cadence stays 1 min**; int 1–100 | `7` | `7` |

The E2E suite overrides these (`TICK_MS=1000`, reset windows `20`) purely to
compress time deterministically — assertions are unchanged and strict.

## Architecture

pnpm + Turbo monorepo:

- **`apps/web`** — Next.js 15 App Router app. Route Handlers + an in-memory
  `globalThis` store = the mocked server; one server-authoritative scheduler;
  an SSE hub streaming live to the browser; React 19 Server Component shell
  with a Client island for the live feeds. Tailwind-only styling (ADR-0007).
- **`packages/domain`** (`@twofront/domain`) — the single Zod contract; every
  type/schema; imported by the server, the UI, *and* the E2E suite. Zero
  parallel type definitions (ADR-0006).
- **`packages/e2e`** — Playwright Page Object Model + the B1/B2 bonus specs.

Full design, Mermaid diagrams, and the `TICK_MS` testability rationale:
**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**. Decision record:
**[`docs/decisions/DECISIONS.md`](docs/decisions/DECISIONS.md)**.

## Brief → implementation checklist

**Required features (F1–F11) — all done:**

- One page, three always-visible sections (Tasks / Emails / SMS), no routing.
- Add task (text + button), pending list, live-ticking age, Complete button.
- Complete → moves to Completed list with completion timestamp (idempotent).
- Emails list newest-first; **immediate email synchronously on task add**.
- Recurring **summary email every 1 minute** (fires even with 0 pending).
- SMS list newest-first; recurring SMS on a **Fibonacci-minute cadence**.
- Configurable **reset windows** for the Fibonacci sequence and the email
  cycle (`FIBONACCI_RESET_MINUTES` / `EMAIL_RESET_MINUTES`).
- Zod on every API boundary; TypeScript strict; Tailwind; pnpm/Turbo monorepo.

**Bonuses — all done:**

- **B1** — Playwright full-lifecycle E2E with a Page Object Model.
- **B2** — complete a task from its email (the `GET /api/tasks/:id/complete`
  email-link adapter, round-tripped through SSE).
- **B3** — architecture handoff: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Optional extras (ADR-0008):** Pomodoro, a read-only time-controls display,
and client-only drag-reorder were scoped as a final *optional*,
non-authoritative wave — safe to omit and **not** required by the brief; the
required scope and all three bonuses are complete independently of them.
