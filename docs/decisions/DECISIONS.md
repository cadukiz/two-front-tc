# Decision Log (handoff mirror)

> Canonical: planner repo `notes/Decisions Log.md`. Read-only mirror so the public submission carries the full ADR set.

---

# Decisions Log — TwoFront

> Canonical decision log (ADR-style). **Every non-trivial technical/architectural decision is recorded here BEFORE it is finalized.** Format: Context → Options → Pros/Cons → Decision → Rationale. This is a required dev-cycle deliverable and a key interview handoff artifact — every decision must be defensible. Mirrored for handoff under `docs/decisions/`.

---

## ADR-0001 — Monorepo depth

**Context:** User explicitly asked for a monorepo for the TwoFront challenge (single Next.js SPA + mocked server + E2E). ~3h time box, all bonuses in scope.

**Options:**
- **A. Full pnpm + Turbo workspace** — `apps/web`, `packages/domain`, `packages/e2e`.
- **B. Single Next.js app, clean internal modules.**

| | A (workspace) | B (single app) |
|---|---|---|
| Requirements fit | ✅ all + explicit monorepo ask | ✅ required items only |
| Pros | Enforced domain/UI/e2e boundaries; `packages/domain` = single Zod contract (strong handoff story); senior-architecture signal; isolates Playwright | Faster to stand up; fewer moving parts; lowest risk in 3h |
| Cons | ~20–30 min extra scaffold; Turbo/pnpm config is one more failure point | Weaker monorepo signal; boundary is convention not enforced; ignores explicit ask |
| Risk in 3h | Medium (mitigated: scaffold is wave-1, parallelizable, well-trodden) | Low |

**Decision:** **A — full pnpm + Turbo workspace.**

**Rationale:** User explicitly asked for a monorepo; it is the stronger interview signal; `packages/domain` as the single shared Zod contract is exactly what the brief probes ("Zod on all API boundaries"). Time cost is real but isolated to the first wave and low-novelty.

---

## ADR-0002 — Real-time transport (live emails/SMS to client)

**Context:** Emails (immediate + 1-min recurring) and SMS (Fibonacci cadence) must appear live in always-visible feeds.

**Options:**
- **A. SSE** stream from a Route Handler.
- **B. Short-interval client polling.**

| | A (SSE) | B (polling) |
|---|---|---|
| Pros | Genuinely real-time; clean server-push; strong signal; deterministic for Playwright | Dead simple; very robust; trivial to test |
| Cons | More code; connection lifecycle/reconnect handling | Not real-time; wasteful; weaker signal |

**Decision:** **A — SSE from a Route Handler.** (User-confirmed.)

**Rationale:** "Real-time task management" is in the brief's first sentence; SSE demonstrates correct server-push architecture, pairs naturally with the server-authoritative scheduler, and remains deterministic for the E2E bonus. Reconnect/offline handling is specified in the UI design.

---

## ADR-0003 — Porting the PortaDaObra harness

**Context:** User asked to bring "all the rules, agents, and configuration" from the PortaDaObra project so the configured harness can drive this build. PortaDaObra's harness is a 13-step phase-cycle methodology with a persona forum, parallel execution, and verification gates — but welded to a 5-repo Go/Next polyglot, branch mirroring, Portuguese domain, i18n, and 1.2 MB of bidding-platform history.

**Options:**
- **A. Verbatim copy of everything** (incl. Go/5-repo CLAUDE.md + all `.planning/` history).
- **B. Port machinery verbatim, adapt the domain layer, exclude project history.**
- **C. Rewrite a fresh lightweight harness.**

| | A | B | C |
|---|---|---|---|
| Pros | Literal request; zero interpretation | Harness actually *runs* on a single Next.js challenge; methodology intact; fast | Cleanest fit |
| Cons | Harness misfires: agents told to write Go, `cd portaldaobra-api`, mirror branches across non-existent repos, run milestone ceremony — wastes the 3h, opposite of "use the harness" | Some inherited docs still show PortaDaObra examples (neutralized via CLAUDE.md OVERRIDE table) | Throws away the configured harness the user wants; slow |

**Decision:** **B.** Copied verbatim: `.claude/{agents,commands,hooks,teams,settings*,package.json}`, `.mcp.json`, `.planning/{WORKFLOW.md,DEFAULTS.md,GLOSSARY.md,config.json,templates/}`, `scripts/`, `Makefile`. Fixed: all hardcoded `/dev/portadaobra` absolute paths → `/dev/twofront` (was a cross-project write-pollution bug). Rewrote: `frontend-dev` + `backend-dev` agents for the single TS monorepo. Authored: `/CLAUDE.md` OVERRIDE layer, `.planning/PROJECT.md`. **Excluded:** PortaDaObra product history — `ROADMAP.md`, `MILESTONES.md`, `STATE.md`, `REQUIREMENTS.md`, `PROJECT.md`, knowledge bases (ASAAS/PAAG/ASSINAFY), `phases/` (127 dirs), `milestones/`, `features/`, `knowledge/`, `research/`, `runbooks/`, `codebase/`.

**Rationale:** The user's goal is a *working* harness for this challenge, not a literal byte-copy. Verbatim Go/multi-repo config would actively sabotage a single Next.js build. Inherited example text that still says "portaldaobra-" is descriptive only and is explicitly superseded by the CLAUDE.md OVERRIDE table. Reversible — source project untouched; exclusions can be copied later if ever needed.

---

## ADR-0004 — Notification cadence & time model

**Context:** Backend forum left open: Fibonacci semantics (gaps vs. marks), empty-summary behavior, and the unit of the time/reset model. These pin the SMS/Email contract fields and the unit-test fixture.

**Decisions (user delegated to recommendations; logged for override):**
- **Time model:** one scheduler tick = **one simulated minute** = `TICK_MS` milliseconds. Demo `TICK_MS=60000` (1 tick = 60 s). E2E sets a small env value (e.g. 50 ms) so the whole cadence is compressible. *(forum Q2 reset-unit + Q4)*
- **Fibonacci semantics:** the sequence `1,1,2,3,5,8…` are the **gaps between SMS sends** (in simulated minutes) → sends land at cumulative minutes `1,2,4,7,12,20…`. Most natural reading of "interval between messages follows the Fibonacci sequence". *(forum Q1)*
- **Empty summary email fires:** the 1-min summary still sends with a "no pending tasks" body when nothing is pending — proves the cadence to the interviewer and gives a simpler invariant ("summary always fires on schedule"). *(forum Q-empty)*
- **Fibonacci exactness:** the pure generator core is **BigInt** so the "~100 known values" unit test is exact (JS `number` loses Fibonacci exactness past ~F(78)). A `number` facade serves the runtime, which only ever uses small indices (reset ≤ 100 min keeps it far from overflow).

**Trade-off accepted:** a slightly richer time module and a BigInt core vs. a deterministic, testable, brief-faithful cadence with zero wall-clock flake under compressed time.

---

## ADR-0005 — Sequence/email reset configuration

**Context:** User added a requirement: a configurable window that **resets the Fibonacci sequence** (e.g. "after N it starts over"), and "the same for email". Clarified to interpretation **1a** with **two separate configs**.

**Decision (user-confirmed):**
- Two **independent** configs, each `z.number().int().min(1).max(100)`, unit = simulated minutes: **`fibonacciResetMinutes`** and **`emailResetMinutes`** (env: `FIBONACCI_RESET_MINUTES`, `EMAIL_RESET_MINUTES`).
- **Fibonacci reset:** when `fibonacciResetMinutes` elapse, the SMS Fibonacci interval sequence restarts from `F(1)` and a new `fibCycle` begins.
- **Email reset (1a):** the summary cadence **stays every 1 minute** (brief intact); when `emailResetMinutes` elapse, an `emailCycle` counter increments. The interval is *not* made configurable (rejected option 1b — would contradict the brief).
- A **`cycle` counter** is added to the `Sms` (`fibCycle`) and `Email` (`emailCycle`) contract records so both resets are observable and Playwright-assertable.

**Rationale:** Keeps the brief's fixed cadences intact, mirrors the two resets symmetrically, and the cycle fields make an otherwise invisible reset provable in E2E. User explicitly chose 1a + separate configs.

---

## ADR-0006 — SSE reliability contract (adopt forum hardening)

**Context:** Forum pessimist surfaced four ~15-line bugs that are demo-visible or CI-flaky; optimist/PM agreed they are in-scope hardening (not creep). Forum Q3/Q5.

**Decision (recommended, logged for override):** adopt all four into the contract — global monotonic **`seq`** as the feed ordering key (`createdAt` display-only), **idempotent complete** (no duplicate `task.completed`), **listener-attached-before-snapshot + `lastSeq` dedupe** on (re)connect (no replay buffer), per-listener broadcast isolation + heartbeat, bounded **last-200** per feed. `tc/packages/domain` is the **single source of truth** — frontend and E2E import its inferred types, zero parallel definitions.

**Trade-off accepted:** ~15–20 extra lines + a `seq`/`lastSeq` field vs. eliminating timestamp-collision sort flake, double-emit corruption, and a lost-event reconnect race under compressed `TICK_MS`.

---

## ADR-0007 — Frontend styling: Tailwind-only (no bespoke CSS)

**Context:** The Claude-Design frontend export (`tc/docs/twoFrontTasks.zip`) ships ~35 KB of hand-written `globals.css` (design tokens + component classes), Next 14 / React 18, `.jsx`. The brief explicitly **requires Tailwind**.

**Options:** (a) keep the design's CSS as-is; (b) **re-express ALL styling in Tailwind**; (c) hybrid (Tailwind utilities + keep the CSS token layer).

**Decision (user, firm): (b) — full Tailwind port. Zero bespoke component CSS.** The only stylesheet is the Tailwind entry (`@tailwind base/components/utilities`); the design's color/font/radius/shadow tokens and keyframes move into `tailwind.config.ts` `theme.extend`; fonts via `next/font`; every component styled exclusively with Tailwind utility classes. Components are ported `.jsx → .tsx` into the existing Next 15 / React 19 app.

**Rationale:** "Our requirement is a requirement" — a stated hard constraint is not negotiable for visual convenience; the recommended hybrid was explicitly rejected. **Trade-off accepted:** significant port effort + visual-drift risk vs. literal brief compliance (verifiable: no non-Tailwind CSS in the app).

---

## ADR-0008 — Extra frontend features kept but deferred & non-authoritative

**Context:** The design includes Pomodoro timer, Time-controls sliders, and drag-to-reorder — beyond the brief; partly conflict with the server-authoritative architecture (ADR-0002/0004).

**Decision (user):** **Keep all three (they're already built, frontend-only) but as the LAST, OPTIONAL work** — done only if time remains after the brief + bonuses; safe to skip otherwise. They must be **non-authoritative**: drag-reorder = client-only cosmetic; Time-controls = read-only display of the real server config (not runtime mutation); Pomodoro = local render mute only (server keeps emitting; nothing about server state changes).

**Rationale:** They add polish at zero architectural cost *if* presented as non-authoritative, but the brief + bonuses come first. **Trade-off accepted:** possible incomplete/omitted extras vs. guaranteed delivery of required scope. Sequenced as the final optional wave; never blocks submission.

---

## ADR-0009 — Runtime-configurable cadence; UI in real units (supersedes parts of ADR-0004/0005/0008)

**Context:** On reviewing the running app the user wants the Time Controls to be **interactive** and to drop the "simulated minute" from the UI entirely. This reverses: ADR-0008 (time-controls read-only), ADR-0004/0005 (cadence env-fixed for determinism; "1 tick = 1 simulated minute" surfaced in UI; resets in *minutes*; an email *reset-cycle*).

**Decision (user-confirmed):**
- **UI speaks real time only.** No "simulated minute" anywhere user-facing; the `tickMs` row is removed from Time Controls. `TICK_MS` is retained **strictly as a test mechanism** (E2E time-compression) — not in the UI, not in the user-facing config surface.
- **Three interactive, integer sliders** (runtime-configurable):
  - `emailSummaryIntervalMinutes` — int **1–100, default 1**. Summary email fires every N real minutes (brief's "every 1 minute" satisfied at the default). **Supersedes** ADR-0005's `emailResetMinutes`/`emailCycle` (the email reset-cycle concept is dropped).
  - `smsBaseIntervalMinutes` — int **1–100, default 1**. SMS Fibonacci gaps = `F(k) × base` minutes (default 1 ⇒ unchanged 1,1,2,3,5,8…). ("for sms and email too" — symmetric pace control for SMS.)
  - `fibonacciResetDays` — int **1–100**. Every N days the SMS Fibonacci sequence restarts (`fibCycle++`). Internally 1 day = 1440 minutes; under test `TICK_MS` compression a day-based reset stays E2E-reachable.
- **Mechanism:** new Zod-validated `PATCH /api/config` mutates runtime config on the server (server stays authoritative); scheduler reads mutable config and recomputes next summary/SMS/reset on change; new config broadcast over SSE so every client stays in sync; sliders debounce → PATCH; optimistic UI reconciled by the SSE config event.
- **Determinism preserved:** the E2E seeds a known config via env and/or the endpoint; `TICK_MS` compression is unchanged and remains the deterministic test lever.

**Trade-off accepted:** we gave up the env-fixed determinism ADR-0004/0005 deliberately protected, in exchange for a real, demonstrable control the user requires. Mitigated by keeping a deterministic test seed path + `TICK_MS` test-only. Logged as a conscious reversal (the decision-log mandate is exactly for cases like this).

---

## ADR-0010 — Every notification email is actionable (B2 fix)

**Context:** Live debugging (systematic-debugging Phase 1) proved the backend round-trip works (`GET /api/tasks/:id/complete` → completes → SSE), but the UI failed the bonus: (RC1) the "Mark complete" action only renders in the *expanded* card — invisible while scanning the feed; (RC2) only `immediate` emails are actionable, while `summary` emails (the feed majority) list pending tasks as inert text. Brief: *"**Each** notification email contains an action button/link that marks the corresponding task complete."*

**Decision (user-confirmed):**
- The complete action is **visible without expanding** the card (matches the always-visible `TaskRow` pattern).
- **Every email is actionable:** `immediate` → a button/link completing its `taskId`; `summary` → a complete control **per listed pending task**.
- **Contract change:** the `Email` summary payload carries pending **`{ id, title }`** pairs (not bare `pendingTitles: string[]`), so each listed task is unambiguously completable (title alone is not unique). Updates `@twofront/domain` (`Email` schema), the store's summary-email construction, and `EmailCard`/`Workbench`.
- All actions use the existing, working **`GET /api/tasks/:id/complete`** email-link adapter and reflect via SSE (server-authoritative, no optimistic mutation).

**Trade-off accepted:** a domain-contract change (pending pairs) + UI rework vs. literal brief compliance ("each email", "the corresponding task") and a robust, collision-free round-trip. The backend was already correct, so blast radius is the contract + email UI only.

---

## ADR-0011 — Drop the SMS Fibonacci-pace control; TICK_MS is strictly test-only

**Context:** On reviewing the running app the user decided the SMS Fibonacci pace should **always** be the natural `F(k)` minutes (not user-tunable), and that the app must **never** run at a compressed tick — `TICK_MS ≠ 1 minute` is a *testing-only* mechanism. This reverses the SMS half of ADR-0009's symmetric "for sms and email too" control.

**Decision (user):**
- **Remove `smsBaseIntervalMinutes` entirely** (contract `RuntimeConfig`/`PatchConfig`/`resolveConfig`, scheduler, UI slider, env, docs, tests). SMS gap = `fibonacciMinutes(fibIndex)` minutes, base fixed at 1. Time Controls now has exactly **two** sliders: `emailSummaryIntervalMinutes` (1–100) and `fibonacciResetDays` (1–100).
- **`TICK_MS` is strictly test-only**, default 60000 (1 real minute). The app always runs at 1 minute; only the E2E overrides it for deterministic time-compression. Operationalized in `.env(.example)` comments + README; no runtime code path defaults to a compressed tick.

**Status:** Implemented but **intentionally uncommitted** at the user's instruction (iterating; HEAD stays `63cbebd`). Full gauntlet green (domain 32 / web 162 / e2e 3). This ADR is recorded now (the decision is made and must be defensible) even though the code is not yet committed.

**Trade-off accepted:** less configurability (SMS pace fixed) vs. a simpler, brief-faithful model (the brief never asked for a tunable SMS pace; "every 1 minute" email + Fibonacci-minute SMS is the spec). Net reduction in surface area and contract size.

---

## ADR-0012 — Final-adjustments wave: startup notifications, blink root-cause fix, SMS caption

**Context:** After demoing the running app the user requested three polish changes, committed together as one "final adjustments" wave (merging the iterative Wave 12 + Wave 13 working set).

**Decisions (user):**
- **Startup notifications:** on scheduler start (first SSE connect) emit **exactly one** summary email + one SMS immediately, single-flight (per-scheduler flag + `globalThis` singleton — no double-emit on reconnect/hot-reload). The startup SMS is the first Fibonacci send (idx 1, fibMinute 1, cycle 0) at minute 0; the sequence then continues coherently (next send idx 2, no duplicate idx-1). Rationale: instant content instead of waiting up to a full real minute; recurring cadence is a pure fn of `minuteCount`, so the startup pair is purely additive.
- **"Mark complete" blink — root-cause fix (not polling; SSE only):** `EmailCard` defined `TaskAction` *inside* its render → new component identity every render → React remounted the button; the pre-existing 1-second relative-time clock re-rendered the un-memoized card every second → hovered button blinked. Fix: hoist `TaskAction` to a stable module-level `memo` component + `React.memo` `EmailCard`/`SmsBubble` + `useCallback`-stable props, so a `now` tick no longer re-renders the feed cards. A regression test asserts DOM-node identity stable across a parent `now` change (provably fails on the old code).
- **SMS caption copy:** `Fibonacci #{n} · every {m}m` → `Fibonacci #{n} - Next message in {m}m`. Note: `fibMinute` is technically the gap that *preceded* this send; the "next message in" wording was the user's explicit, conscious copy choice (clearer for users) — recorded so it is a deliberate decision, not an inaccuracy.

**Trade-off accepted:** minor wording imprecision (`fibMinute` framed as "next") accepted for user-facing clarity; startup pair adds two boot-time notifications by design. All committed as a single wave per the user's "merge into one" instruction.
