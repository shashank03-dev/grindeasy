# grindboard: hosted leaderboard + zero-touch install

**Date:** 2026-07-09
**Status:** Draft for review

## Problem

Getting onto the grindboard leaderboard currently takes eleven manual steps: six in the
Discord Developer Portal to register a personal application and upload art assets
(`README.md:50-64`), then self-hosting a server, then copy-pasting an agent token from
`/me` into `~/.grindboard/config.json` (`README.md:86-90`). Each step sheds users. Most
people will not edit a JSON file to join a leaderboard.

Separately, the product has no public face. The only UI is a dashboard on `localhost:4599`
that nobody but its owner ever sees.

## Goals

1. Install to leaderboard in two commands and one Discord login. No file editing, ever.
2. A hosted, well-designed public leaderboard that is the product's only UI.
3. Preserve the anti-cheat properties of the existing ingest path.

## Non-goals

- Solving client-side trust. The agent reports its own totals and a determined user can
  forge them. The existing rate clamp bounds the damage; this work does not change that.
- GitHub as an identity provider. Rich Presence requires a Discord account regardless.
- Migrating historical data. There are no production users yet.

## Architecture

Three units with narrow interfaces between them.

**The agent** (`src/`, published to npm, zero runtime deps beyond `@xhayper/discord-rpc`)
measures and pushes. It must run on the user's machine: `src/tools.ts:11-45` detects
activity from file modification times under `~/.claude/projects`, `~/.codex/sessions`, and
friends, and `src/presence.ts:21` drives the Discord card over IPC to the local desktop
app. Neither has a cloud equivalent. The agent is headless — it prints status to the
terminal and pushes aggregates over HTTP.

**The web app** (`web/`, Next.js on Vercel) is the leaderboard, the login, the pairing
confirmation, and the ingest API. It is the only UI.

**The database** (Neon Postgres) holds users, sessions, agent tokens, ingest baselines, and
pairing requests.

The interface between agent and web app is exactly two calls: `POST /api/ingest` (existing
contract, `src/sync.ts:10-16`) and the pairing endpoints below.

## Why `server/` is deleted rather than deployed

`server/src/db.ts:79-85` opens a file-backed SQLite database via `new DatabaseSync(path)`
and enables WAL mode; `server/src/env.ts:18` points it at `./grindboard.db`. Vercel functions
have no durable filesystem — writes are lost between invocations and concurrent instances
do not share state. Losing `agent_tokens.baseline_json` is worse than losing the board: the
anti-cheat in `applyIngest` credits *deltas against that baseline*, so a reset baseline lets
users re-claim hours they already banked.

The valuable logic is pure and ports unchanged: `server/src/ingest.ts` (clamping),
`server/src/leaderboard.ts` (ranking), and the shared `src/tiers.ts` / `src/plan.ts`. Only
the transport and storage layers (`db.ts`, `router.ts`, `pages.ts`, `http.ts`, `index.ts`)
are replaced. Their tests move with them.

`Store`'s methods are synchronous today (`this.db.prepare(...).get(...)`). Every network DB
client is async, so the repository interface and its callers become `await`-ed. This is
mechanical but touches every call site.

## Part A — Zero-touch install

### A1. Official Discord application

`DEFAULT_CONFIG.discordClientId` (`src/config.ts:34`) ships with grindboard's own registered
application ID, exported as a single constant `OFFICIAL_DISCORD_APP_ID`. Art assets live on
that app, so every user's card renders correctly instead of showing a missing image. The
same application serves the web app's OAuth (`server/src/oauth.ts` already takes a client id
and secret), so there is one Discord app total.

`discordClientId` remains an override for self-hosters.

> **Unverified assumption.** Discord's terms have not been confirmed to permit one
> application ID serving Rich Presence for all users of a distributed tool. Isolating this
> to one constant keeps the revert to per-user IDs a one-line change. **Confirm before
> public launch.**

### A2. npm distribution

`package.json:6` already declares `"bin": { "grindboard": "dist/index.js" }`. Add
`repository`, `homepage`, and `files`; publish. Install becomes `npx grindboard` or
`bunx grindboard`.

### A3. Pairing (device-authorization flow)

The agent runs on localhost; the web app is remote. Rather than ferrying a token between
them by hand, use the flow `gh auth login` and `docker login` use.

```
agent                          web app                        user
  │                               │                             │
  ├─ POST /api/pair/start ───────►│                             │
  │◄── { deviceCode, userCode } ──┤                             │
  │                               │                             │
  ├─ opens browser to /pair?code=USERCODE ────────────────────► │
  │                               │◄── Log in with Discord ─────┤
  │                               │◄── "Authorize this device?" ┤
  │                               │  binds userCode → user_id   │
  │                               │                             │
  ├─ POST /api/pair/poll ────────►│                             │
  │   { deviceCode }              │                             │
  │◄── { accountToken } ──────────┤                             │
  │                               │                             │
  └─ writes accountToken into ~/.grindboard/config.json           │
```

`src/config.ts:58` already owns writes to that file, so the agent writing its own token is
consistent with existing ownership.

**Tokens are per-device, not per-user.**

An earlier draft of this spec claimed pairing must reuse one token per user, because a fresh
token would re-credit the user's lifetime totals. That is false. `applyIngest` returns
`creditedMsByTool: {}` when the baseline is null (`server/src/ingest.ts:102`), and
`server/test/ingest.test.ts:25` asserts it: *"first ingest sets the baseline and credits
nothing."* Minting a token is safe.

The actual defect runs the other way. `getOrCreateAgentToken` (`server/src/db.ts:157`)
returns **one token per user**, holding **one baseline**. Two machines sharing it ratchet
against each other:

| step | agent | reports | baseline before | outcome |
|---|---|---|---|---|
| 1 | laptop | 100h | 100h | normal delta credit |
| 2 | desktop | 5h | 100h | totals decreased → re-baseline to 5h, credit 0 |
| 3 | laptop | 100h | 5h | delta 95h → **clamped to elapsed wall-clock, credited** |
| 4 | desktop | 5h | 100h | re-baseline again… |

Step 3 credits elapsed wall-clock time regardless of whether either machine did any work.
Two machines left running overnight bank hours for doing nothing.

So: each successful pairing mints its **own** token with its **own** baseline, scoped to one
device. `agent_tokens` gains a `label` and `last_seen_at` so users can see and revoke
devices. This makes per-device deltas honest.

The residual hole is that N paired agents can each credit up to elapsed wall-clock, so a
determined user can inflate by running fake agents. That is the same client-side trust
problem listed under Risks, not a new one, and it is bounded by wall-clock per device. A
per-user credit ceiling across devices would close it; out of scope for this pass, but
noted.

**Pairing table.**

| column | type | notes |
|---|---|---|
| `device_code` | text primary key | 32 random bytes, hex; secret, agent-held |
| `user_code` | text unique | short, human-readable; shown in browser |
| `user_id` | int null | set on authorization |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | 10 minutes |
| `consumed_at` | timestamptz null | single use |

Rate-limit `/api/pair/poll` by `device_code` and `/pair` lookups by `user_code` to make
guessing a short code impractical. Expire aggressively.

### A4. Headless agent

Delete `src/statsServer.ts` (213 lines) and `statsPort` from config. Terminal output
replaces it:

```
⚡ grindboard — signed in as shashank
◆ Platinum · PRO      ⏱ 2h 14m today
#7 on the board → grindboard.tech/u/shashank

watching: Claude Code, Codex
```

Not signed in, the agent still tracks locally and drives the Discord card; it prints a
`npx grindboard login` hint instead of a rank.

### A5. Privacy story

`README.md:20-31` claims the agent is 100% local by default with opt-in sync. That stays
**true**: `SyncClient.enabled` (`src/sync.ts:71`) requires a non-empty `accountToken`, and a
token can only be obtained by completing pairing. Shipping a default `serverUrl` does not
send anything on its own. The README must be rewritten to say this precisely, because
"default server URL" reads like "phones home by default" if left unexplained.

## Part B — The hosted leaderboard

### B1. Stack

Next.js App Router on Vercel. Neon Postgres via the Vercel Marketplace (`@vercel/postgres`
and `@vercel/kv` are sunset; Neon is the current Postgres path). Drizzle for schema and
migrations. Postgres is swappable for Supabase later since we use none of its auth.

Server-render the board so shared links preview correctly. Revalidate on a 30s window;
agents only push every `syncIntervalMs` (5 min) anyway.

**Do not port the current polling interval.** `server/src/pages.ts` runs
`setInterval(tickBoard, 5000)`, once per five seconds, while `src/config.ts:44` sets
`syncIntervalMs` to five *minutes*. The board therefore refetches roughly sixty times per
change. Against a local SQLite file that is free; on Vercel each poll is a function
invocation plus a Postgres query, multiplied by every open tab. Serve the board SSR'd with
a short revalidate window and let clients refresh on an interval closer to the actual data
cadence, or over a single push channel. Treat sub-minute polling as a cost bug.

### B2. Routes

| Route | Replaces | Notes |
|---|---|---|
| `/` | `renderLanding` | SSR leaderboard |
| `/u/[handle]` | — | new: public profile, linked from terminal |
| `/pair` | — | new: device authorization confirm |
| `/api/ingest` | `router.ts:57` | contract unchanged |
| `/api/pair/start`, `/api/pair/poll` | — | new |
| `/auth/login`, `/auth/callback`, `/logout` | `router.ts:97-148` | ported |

`/me` folds into `/u/[handle]` plus an authenticated settings view. The agent-token display
disappears entirely — nobody needs to see it once pairing writes it.

### B3. Schema (ported from `server/src/db.ts:7-34`)

`users`, `tool_totals`, `sessions`, `agent_tokens` port directly.
`INTEGER PRIMARY KEY AUTOINCREMENT` becomes `GENERATED ALWAYS AS IDENTITY`;
`baseline_json TEXT` becomes `jsonb`. Add `pair_requests` from A3.

### B4. Testing

`ingest`, `leaderboard`, `tiers`, `plan`, `tracker`, `fsScan`, `snapshot` tests are pure and
survive untouched — they are the tests that encode the anti-cheat and scoring rules, and
they must keep passing. The repository gets an interface so its consumers can be tested
against an in-memory fake; one integration test exercises real Postgres.

## Part C — Design

`new-york` style, dark by default, zinc base, Geist Sans for interface and Geist Mono for
metrics, hours, and ranks. One accent via `--color-primary`.

Tier colors (Bronze → Diamond) are five categorical *data* colors used only on tier badges.
They must not compete with the accent — accent is for interactive affordances only.

shadcn components: `table`, `badge`, `avatar`, `card`, `skeleton`, `tooltip`, `separator`,
`alert`, `dropdown-menu`. Init with `npx shadcn@latest init -d` (`-y` alone still prompts;
`--style` / `--base-color` / `--css-variables` were removed in CLI v4 and error).

Two known traps to handle at implementation time:

- `Avatar` has no `size` prop. Size via `className="h-8 w-8"`. The board is a wall of
  avatars, so this bites immediately.
- `shadcn init` can write `--font-sans: var(--font-sans)` into `@theme inline`, a circular
  reference that silently kills Geist. Use literal family names, and put the font variable
  classes on `<html>`, not `<body>`.

Motion is scoped: animated count-up on hours and rank transitions on the board. React Bits
components are copy-paste and pull in `gsap` or `motion` — confirm each component's actual
dependency before adding it rather than assuming. Everything respects
`prefers-reduced-motion`.

## Risks

1. **Discord ToS (unverified, launch-blocking).** See A1.
2. **Client-side trust.** Unchanged by this work; the rate clamp is the only defense. Worth
   stating plainly in the README rather than implying the board is tamper-proof.
3. **Losing self-hostability.** Deleting `server/` removes the "self-hostable, zero deps"
   claim from `README.md:9` and `server/package.json:5`. The *agent* stays zero-dep; only
   the server claim dies. Decided: acceptable.
4. **Cold starts** on free-tier Postgres will make the first board load slow. SSR caching
   mitigates.
5. **No offline UI** once `statsServer.ts` is gone. Terminal output is the fallback.

## Build order

Part A ships first and alone: it is what stands between the project and users. A beautiful
board nobody can join is worth less than a plain board they can. But A3 (pairing) depends on
the web app existing, so B1–B3 (stack, routes, schema — unstyled) land with it. Part C
(design) and the `/u/[handle]` profile follow independently.

1. `web/` scaffold, Neon, schema, ported pure logic, ported OAuth. Unstyled.
2. Pairing endpoints + agent `pair.ts` + config self-write.
3. Official app ID, npm metadata, delete `statsServer.ts`, rewrite README.
4. Design system, board, profile pages.
5. Delete `server/`.
