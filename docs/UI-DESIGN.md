# TwoFront — UI Design Definition

> A design brief for generating the interface (e.g. with Claude Design). Tech-agnostic on visuals; precise on structure, states, hierarchy, and behavior. You have a visual reference already — treat the palette/typography here as guidance, and the **layout, sections, component anatomy, and states as the contract**.

---

## 1. Product in one sentence

A single, real-time **operations dashboard** where a user manages tasks and watches automated **Email** and **SMS** notifications stream in live as those tasks change.

## 2. The defining constraint

**One page. Three sections — Tasks, Emails, SMS — all visible at the same time. No routing, no tabs, no accordions between them.** This is the core of the design: the user sees a task they add and, moments later, sees the notification it generated appear in the feeds beside it. The layout must make that cause-and-effect *legible at a glance*.

## 3. Design principles

1. **Live and alive.** New emails/SMS arrive via a server stream. Arrivals should feel like something *happened* — a gentle slide/fade-in at the top of the feed, a brief highlight that settles. Never a jarring full-list jump.
2. **Cause beside effect.** Tasks on one side, the notifications they trigger on the other, simultaneously visible. The eye should be able to connect "I added X" → "here's the email about X."
3. **Calm density.** This is a feed-heavy screen. Generous spacing, clear typographic hierarchy, restrained color. Color is reserved for *meaning* (notification type, task state), not decoration.
4. **Time is first-class.** Every item is timestamped. Relative age ("2m ago") for scanning, absolute time on hover/secondary line for precision.
5. **Trustworthy feedback.** Adding a task and completing a task must give immediate, unmistakable visual confirmation.

## 4. Overall layout

**Desktop (≥1024px):** Three equal-width columns, full viewport height, each independently scrollable. A slim app header spans the top.

```
┌─────────────────────────────────────────────────────────────────┐
│  TwoFront            ● live          <connection status pill>     │  ← header (~56px)
├───────────────────┬───────────────────┬───────────────────────────┤
│      TASKS        │      EMAILS       │           SMS             │
│  [section header] │  [section header] │     [section header]      │
│                   │                   │                           │
│  ┌─ add bar ───┐  │  ┌─ email card ┐  │  ┌─ sms bubble ────────┐  │
│  └─────────────┘  │  └─────────────┘  │  └─────────────────────┘  │
│                   │                   │                           │
│  Pending (n)      │  (newest first,   │  (newest first,           │
│  ┌─ task row ──┐  │   scrolls)        │   scrolls)                │
│  └─────────────┘  │                   │                           │
│                   │                   │                           │
│  Completed (n)    │                   │                           │
│  ┌─ task row ──┐  │                   │                           │
│  └─────────────┘  │                   │                           │
│  (col scrolls)    │                   │                           │
└───────────────────┴───────────────────┴───────────────────────────┘
```

**Tablet (640–1023px):** Two columns — Tasks full-width on top, Emails + SMS side-by-side below; or a 2-col grid that reflows. Each section keeps its own scroll.

**Mobile (<640px):** Single column, stacked in order **Tasks → Emails → SMS**. Page scrolls; sections are full-width cards with a sticky mini-label so the user always knows which feed they're in. All three remain on the same page (just stacked) — no tabs.

Each section is a **panel**: rounded container, subtle border, distinct header with a title and a live count, its own internal scroll area on desktop.

## 5. Section specs

### 5.1 Tasks (column 1)

**Header:** `Tasks` + the pending count as a pill.

**Add bar (top, sticky within the column):**
- A single-line text input, placeholder `Add a task…`
- An `Add task` primary button to its right (or icon-button on narrow widths)
- Enter key also submits
- **Empty/whitespace input:** button disabled or inline error `Enter a task title` — never adds blank tasks
- On submit: input clears, focus stays in the input (rapid entry), the new task appears at the **top of Pending** with a brief highlight

**Pending list** — section subheading `Pending · {n}`. Each **task row**:
- Task **title** (primary, truncates with ellipsis, full text on hover/title attr)
- **Age** — relative, auto-ticking: `just now`, `12s ago`, `3m ago`, `1h ago`. Secondary text. Tooltip/secondary shows absolute created time.
- **Complete** button (right-aligned). Affordance: outlined/ghost, turns into a clear "done" affirmation on click.
- Hover state lifts the row subtly.
- **Empty state:** friendly, centered — `No pending tasks. Add one above to see notifications fire.`

**Completed list** — section subheading `Completed · {n}`, visually separated (divider or muted background). Each **completed row**:
- Title with a strikethrough or a check icon, de-emphasized color
- **Completion timestamp** — absolute, formatted (e.g. `May 15, 14:32:07`), plus optional relative age
- No actions (terminal state)
- **Empty state:** `Nothing completed yet.`

Newest items at the top of each list. When a task moves Pending → Completed, animate the transition (fade out of Pending, slide into top of Completed) so the cause is visible.

### 5.2 Emails (column 2)

A feed of received emails, **newest first**, column scrolls. Each **email card**:

- **Type badge** (top-left): two kinds, visually distinct —
  - `Immediate` — triggered the moment a task is added (accent color, e.g. solid badge)
  - `Summary` — recurring digest, fires ~every minute with the current pending list (neutral/secondary badge)
- **Subject** — bold, one line, truncates
- **Body** — 2–4 lines; for summary emails this is a compact list of current pending task titles (render as a tidy list, not a run-on string); for immediate emails, a short sentence referencing the task
- **Timestamp** — formatted absolute time, secondary; relative age optional alongside
- **Action button — "Mark complete"** *(appears only on `Immediate` emails that reference a still-pending task)*: a clear inline button inside the card. Clicking it completes that exact task — the Tasks column must reflect it instantly (round-trip). After completion, the button becomes a disabled/"Completed ✓" state in the card (the email stays in the feed as a record).
- New arrivals slide/fade in at the top with a brief highlight.
- **Empty state:** `No emails yet. Add a task to trigger the first one.`

### 5.3 SMS (column 3)

A feed of received SMS messages, **newest first**, column scrolls. Styled as **message bubbles** (chat-like, incoming), which visually differentiates this column from Emails at a glance. Each **SMS bubble**:

- **Body** — short text containing the current pending task list (compact)
- **Timestamp** — formatted, small, beneath or trailing the bubble (relative + absolute on hover)
- Optional tiny meta line: the cadence is **Fibonacci-spaced** (1, 1, 2, 3, 5, 8… minutes between sends). A subtle, optional caption like `next in ~5m` is a nice touch but not required.
- New arrivals animate in from the bottom-or-top consistently with "newest first" (newest at top of the scroll feed).
- **Empty state:** `No messages yet.`

## 6. Global behaviors & states

- **Connection status pill** in the header: `● live` (connected stream), `reconnecting…`, `offline`. Small, calm, not alarming.
- **Real-time inserts:** every new email/SMS enters with a short (~250–400ms) enter animation and a one-shot highlight that decays. The list must not scroll-jump if the user has scrolled down — respect their scroll position; optionally show a `↑ new` chip to jump to top.
- **Optimistic add:** a newly added task appears immediately (optimistic), reconciling when the server confirms.
- **Loading (first paint):** lightweight skeleton rows in each section rather than spinners.
- **Error states:** if the stream drops, show the reconnecting pill and keep last-known data visible (never blank the feeds). Inline, non-blocking error toasts for failed actions (e.g., "Couldn't complete task — retry").
- **Empty states:** each section has its own (copy specified above) — never show an empty bordered box with nothing in it.

## 7. Visual system (guidance — defer to the user's reference)

- **Aesthetic:** modern, clean, slightly technical/"product dashboard." Think calm SaaS, not playful consumer.
- **Surface:** light theme baseline; dark theme is a plus. Panels on a subtly tinted app background so the three columns read as distinct cards.
- **Color = meaning:**
  - One accent/brand color → primary actions (Add task) and the `Immediate` email badge
  - Success/positive → task completion, "Completed ✓"
  - Neutral/secondary → `Summary` badge, timestamps, meta
  - Reserve red strictly for genuine errors
- **Typography:** clear hierarchy — section titles > item titles (semibold) > body > meta/timestamps (smaller, muted). One sans-serif family is fine.
- **Spacing:** generous vertical rhythm inside feeds; cards/rows separated by space or hairline dividers, not heavy borders.
- **Motion:** purposeful and quick (200–400ms), easing-out. Only for: item enter, state transition (pending→completed), highlight decay. No decorative animation.
- **Density:** comfortable, scannable. A user should be able to track ~6–8 items per column without scrolling on a laptop.

## 8. Component inventory (for the design system)

- `AppHeader` — brand, connection status pill
- `SectionPanel` — titled, scrollable container with live count (used 3×)
- `AddTaskBar` — input + primary button, with disabled/error states
- `TaskRow` — pending variant (title, ticking age, Complete button) and completed variant (title, completion timestamp, done styling)
- `EmptyState` — icon + copy, one per section
- `EmailCard` — type badge, subject, body (text or task-list), timestamp, optional inline `Mark complete` action with completed state
- `SmsBubble` — incoming chat bubble, body, timestamp, optional cadence caption
- `Badge` — `Immediate` / `Summary` variants
- `ConnectionPill` — live / reconnecting / offline
- `NewItemHighlight` — the one-shot arrival highlight wrapper
- `Toast` — non-blocking action errors

## 9. Accessibility

- Semantic landmarks: each section is a labeled `region`/`section` with a heading.
- Incoming notifications announced via a polite `aria-live` region (don't spam — announce count/last item).
- All actions keyboard-reachable; visible focus rings; Enter submits the add form.
- Color is never the only signal — badges and states also carry text/icon.
- Sufficient contrast for muted timestamp text (it's still information).
- Respect `prefers-reduced-motion`: replace enter/transition animations with instant or fade-only.

## 10. Acceptance checklist (design is "done" when…)

- [ ] All three sections visible simultaneously on desktop with no routing; gracefully stack on mobile
- [ ] Add bar: clear primary action, disabled/error on empty input, focus retained after add
- [ ] Pending rows show title + auto-updating relative age + Complete; Completed rows show title + absolute completion time
- [ ] Email cards visually distinguish `Immediate` vs `Summary`; summary body renders pending tasks as a readable list
- [ ] `Immediate` email card includes a working `Mark complete` action with a post-completion state
- [ ] SMS rendered as distinct bubbles, newest first, with formatted timestamps
- [ ] Real-time arrival animation + non-jumping scroll behavior specified
- [ ] Every section has loading, empty, and error states designed
- [ ] Connection status communicated calmly in the header
- [ ] Reduced-motion and keyboard/focus states covered
