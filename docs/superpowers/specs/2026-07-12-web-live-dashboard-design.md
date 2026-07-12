# grindeasy.tech — Live authenticated dashboard

Date: 2026-07-12
Status: Approved, in implementation

## Goal

On grindeasy.tech, a signed-in developer can open their own personal dashboard
*over* the global leaderboard by tapping a user control in the top-right. The
page carries an interactive, tier-tinted particle background that reacts to the
mouse and reflects whether the user is online (running Claude/Codex right now).

This is deliberately more expressive than `PRODUCT.md`'s terminal restraint — an
explicit product decision. Restraint is preserved by keeping the board itself
calm and concentrating the loud interactivity in the particle background and the
on-tap card. Particle density/opacity/speed remain single knobs to dial back.

## Decisions (locked)

- **Data source:** server-synced DB, not the localhost agent. Works on any
  device; no CORS / mixed-content. Consequence: the card shows only what the DB
  stores — it cannot show streak/achievements (local-only) except via a future
  presence signal.
- **Presentation:** dropdown panel from the top-right user control (not a drawer
  or a separate page).
- **Particles:** whole-page, always on when signed in. **Signed out → black, no
  particles.** On login the particles "take birth" with a designed, smooth,
  pattern-based reveal (the hero moment), then settle.
- **Online signal:** accurate `active` flag added to the sync payload, with a
  graceful fallback to the existing `lastSeenAt` heartbeat proxy for older
  agents.

## What the DB can feed the card

Stored: `users(username, avatar, plan, combos)`, `tool_totals(toolId, activeMs)`,
`agent_tokens.lastSeenAt` (stamped every ingest by `saveBaseline`).

Derivable: tier name/glyph, total hours, XP, next-tier progress, per-tool
breakdown, plan badge, and **rank out of everyone** via `rankOf(boardRows())`.

Not stored (local-only, out of scope for the card): streak, achievements, and —
until this work — live active/idle. This work adds live presence.

## Architecture

### A. Agent (`src/`)

- `SyncPayload` (`src/sync.ts`) + `buildPayload()` gain a privacy-safe
  `active: boolean` and `activeNow: string[]` (tool ids only — already
  non-secret, they are keys in `toolTotalsMs`). The agent already computes
  `active` and passes it to `maybeSync(stats, plan, now, active)`.
- Bump `AGENT_VERSION`.
- No other payload change. The privacy promise holds: no code, prompts, paths,
  or keys ever leave the machine.

### B. Server (`web/lib/core/ingest.ts`, ingest route, DB schema)

- `IngestPayload` gains optional `active?: boolean` and `activeNow?: string[]`.
  `parsePayload` reads them defensively, defaulting to `false` / `[]`, so agents
  that predate this change keep ingesting unchanged.
- DB migration: add `users.lastActiveAt timestamptz` and `users.activeNow jsonb`
  (nullable). On ingest, when the payload reports active, stamp
  `lastActiveAt = now` and `activeNow = payload.activeNow`.
- One pure helper `isOnline(user, now)` in core:
  - Prefer the explicit flag: `active` && `lastActiveAt` within a freshness
    window (≈ 2× the active sync interval, so ~2 min).
  - Fallback for old agents (no flag ever seen): `lastSeenAt` within ~2 min.
  - This helper is the single swap-point behind the "proxy vs. flag" decision.

### C. Web data flow (server → client)

- `web/app/page.tsx` stays a server component. When `currentUser()` is present,
  it builds a `UserCardData`:
  `{ username, avatarUrl, tierName, tierGlyph, planBadge, rank, totalPlayers,
     hours, combos, xp, nextTierProgressPct, perTool: {id,hours}[], isOnline,
     activeTools }`
  from `userToolTotals()`, `rankOf(boardRows())`, tier math, and `isOnline()`.
- The builder is pure and unit-tested alongside `leaderboard.test.ts`.

### D. Front-end (new client components in `web/components/`)

- **`ParticleField`** — React Bits `Particles`, fixed and full-page behind all
  content. `pointer-events` tuned to track the cursor without blocking
  clicks/scroll. Props: `signedIn`, `tier`, `online`.
  - Signed out → black, no particles.
  - On login → **birth reveal**: a designed, pattern-based spawn (not a plain
    fade) — particles emerge from a coherent pattern and disperse smoothly into
    the field, count/opacity/scale ramped with a GSAP timeline. Respects
    `prefers-reduced-motion` (reduced → instant, static field).
  - Color by tier, reusing the `oklch` ramp in `tier-badge.tsx`: Bronze amber,
    Silver grey, Gold yellow, Platinum pale-cyan, Diamond bright-cyan.
  - Online → energized variant of the tier hue (brighter, slightly faster);
    offline → calm tier hue. GSAP tweens between states; never snaps.
  - Mouse movement nudges hue/brightness around the tier base and the particles
    react to the cursor (magnetism / drift). GSAP `quickTo` for the pointer.
- **`UserMenu`** — top-right control.
  - Signed out → `Sign in` button → `/auth/login?next=/`.
  - Signed in → avatar + name pill with a small online dot → opens the dropdown
    via a GSAP timeline (panel scale + fade + slight y; stat rows stagger in).
- **`UserCard`** — frosted-glass dropdown: `backdrop-filter: blur`, translucent
  tier-tinted border, cursor-following spotlight (GSAP `quickTo`). Renders
  `UserCardData`; `Log out` → `/logout`; empty state (signed in, never paired)
  nudges `npx grindeasy` + `grindeasy login`.
- Add `gsap` and the React Bits particle dependency to `web/package.json`.
  Exact React Bits `Particles` prop names pinned via the react-bits-master skill
  at build time. Read `node_modules/next/dist/docs/` before Next-specific code
  (per `web/AGENTS.md` — this is a non-standard Next.js).
- Visual execution guided by the `frontend-design` and `design-taste-frontend`
  skills.

## Error handling / edge cases

- Signed in but never paired (no tool_totals): card shows the empty state;
  particles still render in the tier color for Bronze (xp 0).
- Old agent (no `active` flag): `isOnline` falls back to the `lastSeenAt`
  heartbeat proxy. No crash, no missing data.
- `prefers-reduced-motion`: birth reveal and pointer motion collapse to a static
  field; dropdown opens without the timeline.
- Particles must never intercept board clicks or scrolling.

## Verification

- Unit: `isOnline()` and the `UserCardData` builder (both pure), plus updated
  `parsePayload` tests for the new optional fields and backward compatibility.
- Manual, in a real browser: signed-out black state; login → particle birth;
  tier color; mouse reaction; online → energized with a tool actually running;
  dropdown open/close; reduced-motion; board clicks unaffected.

## Out of scope

- The localhost:4599 live path (ruled out; server-synced only).
- Streak / achievements on the web card (local-only data).
- Any change to scoring, ranking, or the board's public shape.
