# Zero-step setup + live rank streaming

**Date:** 2026-07-11
**Status:** Approved

## Problem

Getting a working viberank card takes six manual steps: create a Discord
application, upload four art assets under exact keys, hand-edit
`~/.viberank/config.json`, then discover and run a separate command to join the
leaderboard. Once running, the card never shows the thing the project is about —
where you stand on the board.

Three gaps, concretely:

1. `OFFICIAL_DISCORD_APP_ID` is `""` (`src/config.ts`), so every user must visit
   the Discord Developer Portal and edit config by hand.
2. `buildActivity()` (`src/presence.ts`) renders tier, plan and active tools. It
   never renders rank. The agent does not even know its own rank — sync is a
   one-way push.
3. Sync fires every 5 minutes regardless of whether the user is coding, so the
   board lags well behind the work.

## Goals

- Install → run → working card, with zero Developer Portal and zero file editing.
- The card shows live leaderboard rank.
- Activity reaches the board within a minute of being earned.

## Non-goals (explicitly cut)

Websockets/SSE. Rank-delta animations (`▲3 today`). Discord's native party
counter. A project rename. Any new board endpoint. Supporter cosmetics.

## Design

### 1. Zero-step setup

**Official Discord application.** One viberank Discord app is created once, its
art assets uploaded under the keys the code already expects (`viberank`, `api`,
`pro`, `max`), and its ID hardcoded into `OFFICIAL_DISCORD_APP_ID`.
`DEFAULT_CONFIG.discordClientId` already reads that constant and `loadConfig()`
already merges `config.json` over the defaults, so a user wanting their own
branding still just sets `discordClientId` — the override costs no new code.

`printSetupHelp()` becomes unreachable on the happy path. It stays as the
fallback for anyone who blanks the constant.

**Distribution.** The npm name `viberank` is owned by an unrelated project
(`sculptdotfun/viberank`, v1.0.3). Publish as `@shashank03-dev/viberank` so the
install path is `npx @shashank03-dev/viberank`. Requires
`publishConfig.access: "public"`, a `files` allowlist, and a `prepublishOnly`
build so `dist/` (which `bin` already points at) exists in the tarball.

**Pairing on first run.** The agent boots and the card connects immediately — no
account needed. Then it asks exactly once:

```
Join the global leaderboard? [Y/n]
```

On yes it runs the device-authorization flow in `src/pair.ts` and writes its own
token via `updateConfig`. When stdin is not a TTY (CI, piped input), the prompt
is skipped and the existing hint is printed instead. `viberank login` remains for
re-pairing later.

The agent half of that flow existed; **the server half did not**. `src/pair.ts`
called `/api/pair/start` and `/api/pair/poll`, and `test/pair.test.ts` passed
only because it mocks `fetch` — against a real server, pairing 404'd. This work
builds the missing endpoints: a `device_codes` table, `POST /api/pair/start`,
`POST /api/pair/poll`, and a `GET`/`POST /pair` approval page gated on an OAuth
session. Codes expire in 10 minutes and are burned on collection, so a leaked
device code can't be replayed. `?next=` carries the pending code through the
OAuth round trip, guarded against open redirects.

This preserves the project's opt-in privacy promise: nothing is sent anywhere
until a human answers yes. It only removes the requirement that the user *know*
a second command exists.

### 2. Live rank on the card

Rank rides back on the sync the agent already makes. No polling, no new
endpoint, no socket.

**Server.** `POST /api/ingest` gains `rank` and `totalPlayers` in its response
body, computed after the ingest is credited.

> **Trap:** `rankBoard(rows, limit = 100)` truncates to the top 100
> (`server/src/leaderboard.ts`). A rank cannot be read out of it for player
> #340. The ingest handler must compute rank against the *full* row set.

**Agent.** `SyncClient` parses `rank` and `totalPlayers` from the ingest
response into its existing `SyncState`. `buildSnapshot` already surfaces
`SyncState` to the local dashboard, so the dashboard gets rank for free.

**Presence.** `PresenceState` gains `rank: number | null`. `index.ts` passes
`sync.state.rank` into `presence.update()`. `buildActivity()` renders:

```
Coding · Claude Code + Codex
#12 on viberank · ◆ Platinum · PRO
```

When rank is null the state line is exactly what it is today
(`◆ Platinum · PRO`). Buttons are unchanged.

### 3. Live sync

`SyncClient.maybeSync()` takes an `active` flag and selects its interval:

- **60s** while at least one tool is active
- **5min** while idle

60s is exactly the server's existing `MIN_INGEST_GAP_MS`, so no anti-cheat
change is needed. The client also begins honoring `retryAfterS` from the
server's `{ ok: false, retryAfterS }` rate-limit response, which it currently
ignores and folds into a generic error.

### Data flow

```
tick
 ├─ detectAll()          → which tools are active
 ├─ tracker.recordTick() → stats
 ├─ presence.update()    → renders rank cached from the last sync
 └─ sync.maybeSync(active)
      └─ POST /api/ingest {totals}
           └─ 200 {ok, rank, totalPlayers} → cached in SyncState → next tick's card
```

## Error handling

Unpaired, sync disabled, server down, or any non-200 leaves `rank` null, and the
card renders exactly as it does today. **The card never degrades because the
board is unreachable.** `SyncClient` already never throws; that property is
preserved. Discord's reconnect loop is untouched. A rate-limit response is
honored rather than retried blindly.

## Testing

- `buildActivity()` is a pure function with no test file today. Add one: rank
  present, rank null, 128-char truncation with long tool names.
- `test/sync.test.ts`: rank parsed from the ingest response; rank null on error
  and when disabled; `retryAfterS` honored; active vs idle interval selection.
- Server: the ingest response returns a correct rank **for a user outside the
  top 100** — this is the truncation trap above.
- `test/config.test.ts`: the official app ID is the default; a user override in
  `config.json` wins.

## Known risk

Discord's developer terms could not be verified — their policy pages return 403
to automated fetch. The precedent of `Puri12/opencode-discord-presence` shipping
a shared app ID for all its users is real, but precedent is not permission.

Mitigation is already in the code: setting `OFFICIAL_DISCORD_APP_ID` back to
`""` restores the per-user flow with no other change.
