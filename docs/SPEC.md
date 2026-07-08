# viberank — Design Spec

Status: Phases 1–3 implemented.

## Problem / product

Developers who use AI coding tools (Claude Code, Codex, OpenCode) have no way to
show that activity on Discord the way Spotify/Epic show theirs. viberank fills
that gap with a local agent that drives a Discord Rich Presence card, tracks
personal tiers, and (Phase 2) a global leaderboard. It is free and funded by
voluntary donations (Razorpay / Buy Me a Coffee).

### Why not just use Discord's "Connections" list?
Those tiles (Spotify, Epic, Xbox…) are curated official partnerships and cannot
be self-added. **Rich Presence** is the open API any developer can build on, and
is what viberank uses.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Tier scope | Personal tiers **and** a global leaderboard (Phase 2) |
| Metric | **Active** coding time (not raw uptime) + multi-tool **combos** |
| Fairness | One global board with a **plan badge** per row (context, chosen over per-plan boards) |
| Plan badge | Auto-detect **API vs subscription**; subscription users declare Pro/Max, trusted as-is |
| Identity | **Discord OAuth** (Phase 2) |
| Money | **Pure donations**, no paywalls, no entitlement logic |
| Name | `viberank` |
| Stack | TypeScript everywhere; Node agent, (Phase 2) Node backend + Postgres + Next.js |

## Architecture

Three parts, built in phases:

- **Agent** (`src/`, Phase 1) — local Node/TS process. Detects tools, measures
  active time, detects plan, drives the Discord card, serves a local dashboard,
  and (opt-in) syncs aggregate totals to a leaderboard server.
- **Backend + Web** (`server/`, Phase 2) — one zero-dependency Node service:
  node:http + node:sqlite (chose the built-in over Postgres — no infra cost, one
  file to back up, fits the donation-funded scale). Discord OAuth (scope
  `identify`), agent link tokens, anti-cheat ingest, server-rendered leaderboard.

### Agent modules (Phase 1)

| Module | Responsibility |
|---|---|
| `config.ts` | Load/create `~/.viberank/config.json` |
| `fsScan.ts` | Newest file mtime under roots (metadata only, never contents) |
| `tools.ts` | Tool definitions + per-tool active detection |
| `tracker.ts` | Fold detection passes into cumulative active time + combos |
| `tiers.ts` | XP → tier ladder |
| `plan.ts` | Derive API/Pro/Max/unknown badge |
| `store.ts` | Atomic load/save of `stats.json` |
| `snapshot.ts` | Build a display snapshot (tier, hours, streak, per-tool) |
| `presence.ts` | Discord IPC client, builds/pushes the activity card |
| `statsServer.ts` | Local dashboard (HTML + `/api/stats`) |
| `sync.ts` | Opt-in leaderboard sync: POSTs cumulative totals, never throws |
| `index.ts` | Poll loop wiring, startup banner, graceful shutdown |

### Server modules (Phase 2, in `server/src`)

| Module | Responsibility |
|---|---|
| `env.ts` | PORT / BASE_URL / DISCORD_* / DB_PATH |
| `db.ts` | node:sqlite schema + queries (users, sessions, agent_tokens, tool_totals) |
| `ingest.ts` | Pure anti-cheat: totals → clamped credited deltas (rate limit, elapsed cap, combo cap, reset re-baseline) |
| `leaderboard.ts` | Pure ranking with the agent's exact XP formula (shared `src/tiers.ts`) |
| `oauth.ts` | Discord OAuth2 code flow, scope `identify` only |
| `router.ts` | Routes: `/`, `/me`, `/auth/*`, `/api/ingest`, `/api/leaderboard`, `/healthz` |
| `pages.ts` | Server-rendered landing/board/profile HTML |

## Detection design (the core)

- **Active** = the newest file under a tool's session directory changed within
  `activeWindowMs` (default 60s). Robust, and reads no file contents.
- **Combo** = 2+ tools active within the same `comboBucketMs` window (default
  5 min), counted once per window.
- **Sleep protection** — a single tick credits at most `maxElapsedMs`, so a
  laptop that slept for hours cannot inject fake active time.
- **Plan** — API key in env / config ⇒ `api`; a Claude subscription credential
  file ⇒ user-declared `pro`/`max`. We check only for *presence*; secrets are
  never read or transmitted.

## Scoring

`XP = totalActiveHours + combos × 0.25`. Ladder: Bronze 0 · Silver 10 · Gold 40 ·
Platinum 100 · Diamond 250. Per-tool time is summed (tool-hours), so concurrent
use accrues faster — intentional, and rewarded further by combos.

## Privacy contract

Sync is opt-in; until a user links an account, everything is local. When linked,
only aggregates leave the machine (tool id, active ms, combo count, plan label,
agent version — authenticated by the user's own agent token) — never code,
prompts, file paths, or credentials. Open source so this is verifiable.

## Anti-cheat (implemented in `server/src/ingest.ts`)

Agents report cumulative totals; the server credits clamped deltas: ≥ 60 s
between ingests, per-tool credit ≤ wall-clock elapsed (elapsed capped at 6 h),
combo credit ≤ elapsed 5-minute windows, decreasing totals re-baseline at zero
credit, first ingest credits nothing. A dishonest client can never earn faster
than real time.

## Known risks

1. **Active-heuristic tuning** — may need per-tool adjustment as tools change log
   layouts. Cursor/Gemini CLI/Aider are explicitly best-effort and user-overridable.
2. **Pro vs Max** not provable locally → trusted self-declaration.
3. **Discord RPC requires the desktop app** — no card for web/mobile-only users.
4. **Multi-machine users** — each machine's agent shares one token; totals-based
   sync means the *max* machine wins per interval rather than double-counting.

## Phasing

- **Phase 1 (done):** agent + card + active tracking + tiers + local dashboard.
- **Phase 2 (done):** `server/` — Discord OAuth, global leaderboard, plan badges,
  anti-cheat ingest, Docker deploy.
- **Phase 3 (done):** Cursor/Gemini CLI/Aider detection, achievements, CI.
- **Next:** hosted public instance, more tools, supporter cosmetics.
