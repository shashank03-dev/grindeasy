# Slack webhook notifier — design

**Date:** 2026-07-17
**Status:** approved for implementation
**Feature:** Product Hunt ask (Emel) — a Slack/webhook version of the weekly recap.

## Goal

When a new ISO week begins, post last week's grindeasy recap to a Slack
Incoming Webhook, so a solo dev or a team channel sees the digest without opening
the terminal or dashboard.

## Scope (MVP)

- **Trigger:** the weekly recap only. No milestones, no live session events.
- **Target:** Slack Incoming Webhooks only (`POST {"text": ...}`). Discord and
  generic webhooks are explicitly out of scope for this MVP.
- **Where it runs:** inside the agent's existing background loop (`index.ts`
  `tick()`), not a separate process or OS scheduler.

## Delivery model (a stated constraint, not a bug)

grindeasy is a local agent, not a server, so it cannot guarantee a fixed
delivery time. The digest posts when the machine is on and the agent first
notices the new ISO week has begun. If the machine is off all Monday, it posts
when the agent next runs. Guaranteed-time delivery would require server-side
infrastructure and is out of scope.

## Architecture

Approach A from the brainstorm: hook into the existing tick loop, gated by a
persisted per-week marker that mirrors the existing console-recap gate
(`stats.lastRecapWeek`). `/api/stats` is deliberately not used — it exposes the
rolling 7-day `weekly`, not the completed ISO-week recap (`computeRecap`), and a
stateless poller cannot cleanly detect the week boundary.

### New module: `src/webhook.ts`

- `formatWeeklyRecap(summary: WeeklySummary): string` — pure. Produces Slack
  mrkdwn text (no ANSI; the terminal renderer's colors would show as garbage in
  Slack). Includes headline hours, delta vs the prior week (or "first week
  tracked"), avg/day, active days, best day, the per-tool breakdown, combos when
  > 0, and the goal line when a goal is set.
- `postSlackMessage(url, text): Promise<{ ok: boolean; error?: string }>` —
  POSTs `{"text": text}` with a 10s AbortController timeout. Never throws;
  network and non-2xx failures come back as `{ ok: false, error }`.
- `planWeeklyRecapDelivery(args): RecapAction` — pure decision function. Returns
  one of:
  - `{ kind: "skip" }` — no URL configured, already handled this week, or inside
    the retry backoff window.
  - `{ kind: "mark", week }` — last week had no activity; mark it handled so we
    don't reconsider it, and send nothing.
  - `{ kind: "post", week, text }` — send `text`, then the caller marks the week
    on success.

### Changes to existing files

- `src/config.ts` — add `slackWebhookUrl: string` to `Config` (default `""`;
  empty means the notifier is off). Config-only, edited by hand in
  `config.json`, same as `weeklyGoalHours`.
- `src/types.ts` — add `lastWebhookRecapWeek: string` to `Stats` (the persisted
  per-week marker, independent of the console `lastRecapWeek`).
- `src/store.ts` — `freshStats` seeds `lastWebhookRecapWeek: ""`. Because
  `loadStats` merges onto a fresh shape, existing stats files stay valid.
- `src/index.ts`:
  - In the `main()` loop, keep an in-memory `nextWebhookAttemptMs` (backoff
    clock; not persisted). At the end of `tick()`, call a small
    `maybePostWeeklyRecap(now)` that runs `computeRecap`, calls
    `planWeeklyRecapDelivery`, and executes the action: on `post` success set
    `stats.lastWebhookRecapWeek` and save; on failure set
    `nextWebhookAttemptMs = now + 30min` and warn (no marker, so it retries).
  - Add a `webhook` command: `grindeasy webhook test` sends a message
    immediately (last week's recap if any, else the rolling weekly, else a plain
    "connected" confirmation) and reports success or failure, so a user can
    verify the URL. Errors clearly if no URL is configured.
  - Extend `printHelp()` with the `webhook test` line.

### Failure handling

- A bad or unreachable URL never crashes the agent. `postSlackMessage` swallows
  errors into a result object; the loop logs a warning and backs off 30 minutes.
- Backoff is in-memory only, so a permanently bad URL retries at most every 30
  minutes (a visible warning the user can act on), and a transient failure
  self-heals on the next attempt. The week is marked handled only on a
  successful post or when there was nothing to send, so a failure never silently
  drops that week's digest.

## Testing

- `formatWeeklyRecap`: first-week vs delta wording; per-tool lines; combos line
  shown only when > 0; goal line shown only when a goal is set; empty/low-hour
  formatting.
- `planWeeklyRecapDelivery`: skip when no URL; skip when the week is already
  marked; skip inside backoff; `mark` when the summary is null; `post` otherwise.
- `postSlackMessage`: success path and failure path against a stubbed `fetch`
  (2xx → ok; non-2xx and thrown network error → `{ ok: false }`).

## Out of scope / follow-ups

- Discord and generic-webhook targets.
- Milestone and live-session triggers.
- A `webhook set <url>` command or an onboarding prompt (config-by-hand for now).
