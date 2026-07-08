# viberank — Design Spec

Status: Phase 1 implemented. Phases 2–3 planned.

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

- **Agent** (this repo, Phase 1) — local Node/TS process. Detects tools, measures
  active time, detects plan, drives the Discord card, serves a local dashboard.
- **Backend** (Phase 2) — hosted API + Postgres; Discord OAuth; leaderboard.
- **Web** (Phase 2) — landing page, live leaderboard, personal stats page.

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
| `index.ts` | Poll loop wiring, startup banner, graceful shutdown |

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

Phase 1 is fully local. In Phase 2 only aggregates leave the machine (tool name,
active minutes, combos, plan label, Discord id) — never code, prompts, file
paths, or credentials. Open source so this is verifiable.

## Known risks

1. **Active-heuristic tuning** — may need per-tool adjustment as tools change log layouts.
2. **Pro vs Max** not provable locally → trusted self-declaration.
3. **Discord RPC requires the desktop app** — no card for web/mobile-only users.
4. **Leaderboard anti-cheat** (Phase 2) — needs sanity caps on reported time.

## Phasing

- **Phase 1 (done):** agent + card + active tracking + tiers + local dashboard.
- **Phase 2:** backend, Discord OAuth, global leaderboard, plan badges, combos.
- **Phase 3:** more tools, cosmetics, polish.
