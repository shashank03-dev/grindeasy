# 0.5.3 — Weekly summary card + Windows durability fix

Status: design, awaiting approval. Ship strategy: **two ships**. This is 0.5.3.
The auto-updater is deliberately **not** here — it ships alone as 0.5.4 (see end).

## Goal

Turn grindeasy from a live-status tool into something you can use to track coding
habits over time, and close the Windows gap in the background-service install so
the same npx-durability bug can't bite there. Ship it all in one release.

## A. Windows durability fix (`service.ts`)

The login-shell `_npx` bug can't occur on Windows (no login-shell probe there), but
Windows currently never ensures a durable binary at all: `installService` skips
`ensureDurableBinary` for `win32` and writes a supervisor that runs
`cmd /c grindeasy`, which breaks after the next reboot for an npx-launched user.

- Extend the durability guard to `win32`.
- Windows resolver: `where grindeasy` (via `cmd /c where grindeasy`), with npx's
  cache stripped from PATH — same idea as the login-shell probe.
- `withoutNpxPath` becomes platform-aware: split on `path.delimiter` (`;` on
  Windows, `:` elsewhere) instead of a hardcoded `:`.
- If not found → `npm i -g grindeasy@<version>` → re-check → still missing → skip
  the service and stay foreground, mirroring linux/darwin.
- **Unit-tested via the injected-runner pattern only.** Cannot be live-tested on
  this Linux host; called out explicitly, same verification level as the existing
  Windows code.

## B. Data model — the one schema change (`types.ts`, `tracker.ts`)

- Daily record: `{ activeMs, combos }` → `{ activeMs, combos, byTool: Record<string, number> }`.
- Tracker already computes per-tool credit each tick; also add it into
  `daily[day].byTool`.
- Backward-compatible: a day with no `byTool` counts as `{}`. Weekly-per-tool
  self-populates over the next 7 days for existing users; no migration.

## C. Weekly block (`snapshot.ts`)

Rolling last 7 day-keys (today + previous 6). Added to `Snapshot`:

- `activeHours`, `combos`
- `perTool[]`, `mostUsedTool` (id + hours + **share %** of the week)
- `perDay[7]` — `{ day, hours }`, for the bar/sparkline
- `avgHoursPerDay`, `bestDay` (`{ day, hours }`), `activeDays` (days with any activity)
- `deltaHours` — vs the prior 7-day window (days 8–14), the trend signal

## D. Personal bests — computed, no new persistence (`snapshot.ts`)

- `bestWeekHours` + when — max over all rolling 7-day windows in history
- `longestStreak` — max run of consecutive active days in history
- Exposed on the snapshot (e.g. `records`). Rolling windows (consistent with C).

## E. Weekly goal (config)

- New config key `weeklyGoalHours` (number; `0`/unset = no goal).
- When set, the weekly card + dashboard show a progress ring/bar
  (`weeklyHours / goal`, %). When unset, the goal UI is simply absent.
- **Default: config-only.** Not added to the onboarding prompts (keeps onboarding
  lean); documented in the README config table.

## F. Monthly / 4-week trend — computed (`snapshot.ts`, `statsServer.ts`)

- `monthly` block: last 4 weeks, each `{ weekLabel, hours, mostUsedTool? }`.
- Dashboard gets it as a third toggle. **CLI stays `grindeasy weekly`** for now;
  monthly is dashboard-first.

## G. Auto weekly recap — interactive-only, terminal (`index.ts` / onboarding path)

- Track `lastRecapWeek` (ISO week key) in stats.
- On an **interactive** run (not the background service), if the ISO week changed
  since `lastRecapWeek` and prior-week data exists, print last week's recap once,
  then update `lastRecapWeek`.
- **Default: terminal recap only in 0.5.3. No Discord card** — the Discord "week in
  review" card is deferred (it touches presence and wants its own toggle).

## H. Dashboard (`statsServer.ts`)

- Toggle `[ Weekly | All-time | Monthly ]`. All-time = today's exact card.
- One 5s poll feeds all views; the toggle switches the visible panel and never
  resets or blanks the others ("each updates independently" = independent data,
  shared poll).
- Weekly panel: hours + delta, avg, best day, active days, most-used tool + share,
  7-day bar, goal ring (when set).
- Monthly panel: 4 weekly bars.
- `/api/stats` returns the enriched snapshot; the client keeps using `textContent`
  (no HTML injection surface).

## I. CLI (`index.ts`)

- `grindeasy weekly` → themed `panel()` of the weekly block: hours + delta, avg,
  best day, consistency (`N of 7 days`), most-used tool + share, a unicode
  sparkline (`▁▂▄█▂▅▃`), and the goal line when set. Added to `--help`.

## J. Tests

`byTool` accumulation; weekly compute (delta, avg, best day, active days,
most-used + share); personal bests (best week, longest streak); monthly windows;
recap trigger logic (week rollover, once-only); Windows durability path;
platform-aware `withoutNpxPath`; CLI renderer.

## K. Ship (after approval)

Bump `0.5.3`, build, full test run, `npm publish`, push `main`, tag `v0.5.3` — once.

---

## Deferred to 0.5.4 (its own release)

Auto-updater / update-notify. Default **notify-only** (auto-install strictly
opt-in), `autoUpdate: notify | auto | off`, asked once in onboarding, silent when
`off`, disclosed in the privacy section. Daily check of registry
`dist-tags.latest` vs local version; "what's new" from a `whatsNew` field added to
`package.json` (confirmed the registry manifest carries arbitrary package.json
fields). Ships alone so a bug here can't hide behind feature churn.
