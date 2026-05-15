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
