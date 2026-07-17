# Weekly leaderboard + weekly user card — design

**Date:** 2026-07-16
**Scope:** grindeasy.tech (`web/` Next.js app). Adds a "This week" view to the
leaderboard and the signed-in user card, alongside the existing all-time view.

## Problem

The server keeps only *cumulative* totals (`tool_totals.active_ms`,
`users.combos`) and never records *when* activity happened — `applyIngest`
credits deltas into running totals. So "who coded the most this week" is
unanswerable from stored data. This feature adds week-bucketed storage at ingest
time and a current-week read path, leaving the all-time path untouched.

## Decisions (settled in brainstorming)

- **Rank metric:** weekly XP = weekly hours + weekly combos × 0.25 — the *same*
  `xpFromTotals` formula the all-time board uses. One scoring model.
- **Windows:** a two-way `[ This week | All time ]` toggle. No monthly (out of scope).
- **Week definition:** the **ISO calendar week in UTC** (Mon 00:00 → Sun 23:59 UTC).
  A resetting calendar week is the fair, coherent choice for a shared board —
  everyone competes over the identical wall-clock window and it resets every
  Monday. (This differs from the local CLI card, which is a rolling 7-day window;
  on the web, "this week" means the calendar week.)
- **Identity vs activity on the card:** tier, plan, and the XP/level-progress bar
  stay **lifetime** (they are identity). Only the *activity* — rank on the viewed
  board, Active, Combos, by-tool, and the new histogram — switches to weekly.
- **No backfill:** timing history is gone; weekly data accrues from deploy. At
  launch everyone shows a partial first week.
- **Also:** remove the card's existing cursor-tracking spotlight animation.

## Data model (additive, day-grained)

Two new tables, mirroring the existing `tool_totals` / `users.combos` split but
keyed by UTC day. Day grain (not week grain) is required by the histogram and
mirrors the agent's own `stats.daily`.

```
daily_tool_totals(user_id, day text, tool_id text, active_ms bigint)
    PK(user_id, day, tool_id), index(day)
daily_combos(user_id, day text, combos int)
    PK(user_id, day), index(day)
```

- `day` is `"YYYY-MM-DD"` in **UTC**, fixed-width so lexicographic range compares
  work for week windows.
- Additive only — no change to existing columns. Safe Neon migration, generated
  with `drizzle-kit generate` and validated by the PGlite migration tests.

## Ingest write path

In `web/app/api/ingest/route.ts`, inside the existing credit transaction, after
`creditTool` / `addCombos`, write the **same clamped deltas** into the day tables
keyed by `dayKeyUtc(now)` (where `now` is the timestamp already passed to
`applyIngest`). Same anti-cheat, no recomputation — the all-time and weekly
ledgers are independent double-writes, never double-counts.

Boundary note: a credited delta lands entirely in the ingest-time UTC day; error
≤ one sync interval (~5 min) and bounded by the existing 6h outage clamp.
Acceptable.

## Read path

New helpers:

- `web/lib/core/week.ts` (pure, tested):
  - `dayKeyUtc(ms): string` — UTC `YYYY-MM-DD`.
  - `isoWeekDaysUtc(ms): string[]` — the 7 day keys Mon→Sun of the UTC ISO week.
  - `isoWeekKeyUtc(ms): string` — `YYYY-Www`, used as the board cache key.
- `web/lib/db/queries.ts`:
  - `creditDailyTool(db, userId, day, toolId, ms)` — upsert `+=` (mirrors `creditTool`).
  - `addDailyCombos(db, userId, day, n)` — upsert `+=` (mirrors `addCombos`).
  - `weeklyBoardRows(db, weekStart, weekEnd): BoardRow[]` — per user, sum active in
    range + sum combos in range, join `users`. **Only users active in the range.**
  - `userWeek(db, userId, weekDays): { toolTotalsMs, combos, perDay }` — one read of
    the user's daily rows for the week: per-tool sums, combo sum, and the 7 per-day
    totals aligned to `weekDays`.
- `web/lib/board.ts`: `getWeeklyBoard(weekStart, weekEnd)` — `unstable_cache` keyed
  by the week (auto-rolls over), 30s revalidate, `BOARD_CACHE_TAG`, feeding the
  existing `rankBoard` / `xpFromTotals`.

## UI

Driven by a URL search param on `/leaderboard`: `?range=weekly` vs default (all-time).
The page is already `force-dynamic` SSR, so the toggle is two `<Link>`s styled as a
segmented control — no client state, no new endpoint, shareable URL. Board and card
switch together off the same `range`.

- **Toggle:** in the board header (`Board`), `[ This week | All time ]`, active state
  from `range`. Title/label reflects the window.
- **Board (weekly):** same columns (Active / Combos / XP), this week's numbers,
  only users active this week. Empty state → "No one's logged time this week yet."
- **Card (weekly):** `buildWeeklyUserCard` keeps tier/plan/level/XP-to-next from
  **lifetime** inputs and takes rank/Active/Combos/by-tool from **weekly** inputs,
  plus a `histogram` (7 bars Mon→Sun; days after today empty). `UserCardData` gains
  an optional `histogram` field; `UserCard` renders the histogram + a "This week"
  caption when present. "Ever paired" is judged from lifetime totals, so a paired
  user with no activity this week still sees the weekly stats (0h, empty bars), not
  the pairing CTA.
- **Remove** the `useEffect` cursor-spotlight in `UserCard` (and its `gsap` import /
  `rootRef`). The `.glass-panel` gradient keeps its static default position.

## Testing

- `week.test.ts`: `dayKeyUtc`, `isoWeekDaysUtc` (Mon→Sun, boundary/year-end),
  `isoWeekKeyUtc`.
- Ingest test: a credit lands in the right UTC day; a later ingest after a day/week
  boundary lands in the new day.
- `weeklyBoardRows` ranking test; `buildWeeklyUserCard` test (lifetime identity +
  weekly activity + histogram; paired-but-idle-this-week case).
- Migration is exercised by the existing PGlite harness (`makeTestDb`).

## Out of scope

Monthly view, historical week browsing, pruning old daily rows, and any change to
the legacy `server/` Docker tree.

## Deploy note

The generated `drizzle/000X_*.sql` migration must be applied to the production Neon
database as part of the deploy. No backfill.
