# Tool auto-detection + npx onboarding UI — Design

Date: 2026-07-12
Status: Approved for planning

## Problem

`grindeasy` knows only 6 AI coding tools, hard-coded in `src/tools.ts`, and tracks
all of them unconditionally. Two gaps:

1. **Discovery.** A user who runs Claude Code plus a less-common editor/agent
   (Windsurf, Zed, Continue, Cline, …) gets no credit for the second tool, and
   there is no way to add one without hand-editing `~/.grindeasy/config.json`.
2. **Onboarding UI.** The first interactive `npx` run uses three visually
   inconsistent surfaces — raw `readline` prompts for the leaderboard and
   service, then a plain `console.log` status block led by a `⚡` emoji. It looks
   unfinished next to the polished web/dashboard identity.

This design adds catalog-based tool discovery with a consent prompt, a way to add
custom tools, and reskins the whole first-run flow to match the project's
phosphor-green terminal brand.

## Goals

- Detect AI coding tools present on the machine beyond the built-in 6, and prompt
  the user (with consent) to start tracking the ones found.
- Prompt on the first run, and again only when a **new** catalog tool appears
  later — never nag twice about the same tool.
- Let the user add a **custom** tool (name + directory + extensions) without
  editing config by hand.
- Give the npx first-run flow a single, branded, polished look built on
  `@clack/prompts`, themed to the project's phosphor-green identity, no emojis.
- Preserve existing behavior exactly for current installs (the 6 core tools keep
  tracking; nothing about credited time changes).

## Non-goals

- No heuristic "sniff unknown dot-dirs" auto-discovery. Discovery is limited to a
  curated catalog plus explicit custom adds.
- No change to the detection *primitive*: activity is still newest-file-mtime
  under a directory, never file contents (`src/fsScan.ts`, `src/types.ts`).
- No animated banner. The gradient banner is static (one render at startup).
- No new leaderboard/server behavior; sync and tiers are untouched.

## Brand reference (source of truth for the theme)

From commit `42ae52c` ("unify the visual identity around a terminal-green theme")
and `src/statsServer.ts`:

| Role | Hex |
| --- | --- |
| Phosphor green (active/primary) | `#82d399` |
| Deep green (echo/secondary) | `#4b8057` |
| Border green | `#2f5a3f` |
| Panel border (subtle) | `#1a211d` |
| Dim text | `#838b87` |
| Dimmer text | `#5b6b60` |
| Foreground | `#e3e7e4` |
| Background | `#0a0d0c` |

The **ascent mark** (`assets/discord/src/mark.svg`) is an upward chevron
(`26,54 → 50,32 → 74,54`) with a dimmer lower echo — "climbing a tier." The CLI
banner renders this as two stacked chevrons: upper phosphor `#82d399`, lower echo
`#4b8057`.

## Architecture

### New modules

- **`src/theme.ts`** — pure terminal-styling helpers. No `console` calls; every
  function returns a string.
  - 24-bit truecolor wrapper: `color(hex, text)` emitting
    `\x1b[38;2;r;g;b m … \x1b[39m`.
  - Named brand helpers: `phosphor`, `deep`, `dim`, `dimmer`, `border`.
  - `gradient(lines: string[], fromHex, toHex)` — interpolate per row for the
    banner.
  - `banner()` — the ascent mark + `grindeasy` wordmark + tagline, gradient-green.
  - `panel(rows, opts)` — a Lip-Gloss-style bordered, padded, column-aligned box
    in border-green.
  - `colorEnabled()` — true only when `process.stdout.isTTY` and `NO_COLOR` is
    unset (per https://no-color.org). When false, all helpers return plain text
    and `panel`/`banner` use ASCII-safe output. This is the single gate every
    other helper consults.

- **`src/catalog.ts`** — the tool catalog and disk probe.
  - `CORE_TOOLS: ToolDef[]` — today's 6 (claude-code, codex, opencode, cursor,
    gemini-cli, aider), moved verbatim from `tools.ts`. Always tracked.
  - `EXTENDED_TOOLS: ToolDef[]` — additional tools whose activity directory is
    **verified from docs at implementation time**. Candidate set (subject to path
    verification): windsurf, zed, continue, cline. Any candidate whose activity
    directory cannot be confirmed is omitted from v1 (presence-only tools are not
    shipped — see Open decisions, resolved).
  - `isPresent(tool, home): boolean` — `existsSync` on any of `activityDirs`.
    Presence only; never reads files.
  - `discoverExtended(home): ToolDef[]` — extended tools present on disk.

- **`src/onboarding.ts`** — the interactive clack flow (TTY only). Exposes one
  entry, e.g. `runOnboarding(config): Promise<OnboardingResult>`, returning the
  chosen `accountToken`, whether a background service now owns tracking, and any
  config mutations already persisted. Internally uses `@clack/prompts`
  (`intro`/`spinner`/`multiselect`/`confirm`/`note`/`outro`) themed via
  `theme.ts`, and calls the existing `pair`/`installService` code paths.

### Changed modules

- **`src/tools.ts`** — keep `detectTool` / `detectAll` (the detection engine).
  Move `defaultTools()` out; the tracked set is now assembled from catalog +
  config (see below). Re-export for back-compat if any test imports it.
- **`src/config.ts`** — schema additions + migration (below).
- **`src/index.ts`** — replace the inline `offerLeaderboard` / `offerServiceInstall`
  / status-block logic with: (a) `runOnboarding` when `process.stdin.isTTY`; (b)
  the existing plain output when not a TTY (service/piped). Add the `tools`
  subcommand dispatch.
- **`src/service.ts`** — `renderRunningStatus` (used by the duplicate-run guard)
  reuses `theme.panel` so the "already running" view matches. Non-TTY output
  stays plain automatically via `colorEnabled()`.

## Data flow

### Tracked set assembly (every run)

```
tracked = CORE_TOOLS
        ++ EXTENDED_TOOLS.filter(t => config.enabledToolIds.includes(t.id))
        ++ config.customTools
```

`detectAll(tracked, …)` is unchanged downstream. Stats are keyed by tool `id`, so
enabling a tool later simply starts accruing under a new key.

### Discovery + prompt (interactive runs only)

```
present   = discoverExtended(home)                       // on disk now
newToOffer = present.filter(t =>
    !config.enabledToolIds.includes(t.id) &&
    !config.declinedToolIds.includes(t.id))
if newToOffer.length && isTTY:
    show panel of tracked + found
    multiselect / confirm  →  accepted, declined
    config.enabledToolIds  += accepted
    config.declinedToolIds += declined     // both sides recorded → never re-ask
```

This yields "first run + new arrivals": the first run offers everything found; a
tool installed next month is offered the next run because it is newly present and
neither enabled nor declined.

## Config schema

Add to `Config` (in `src/config.ts`):

```ts
/** Extended-catalog tool ids the user opted into tracking. */
enabledToolIds: string[];
/** Extended-catalog tool ids the user declined — never re-offered. */
declinedToolIds: string[];
/** User-added custom tools; always tracked. */
customTools: ToolDef[];
```

`DEFAULT_CONFIG` sets all three to `[]`.

### Migration

The existing `tools: ToolDef[]` field ("empty = defaults, non-empty = override")
is retained only for one-time migration:

- On `loadConfig`, if `config.tools` is non-empty and `config.customTools` is
  empty/undefined, move `config.tools` into `config.customTools`, clear `tools`,
  and write back. A user who hand-set `tools` keeps tracking those exact tools.
- If `config.tools` is empty (the default for every current install), do nothing.
  Core tools continue to track exactly as before.

`enabledToolIds` / `declinedToolIds` absent in an old config default to `[]` via
the existing `{ ...DEFAULT_CONFIG, ...parsed }` merge, so upgrades are seamless.

## `grindeasy tools` subcommand

Dispatched in `main()` alongside `login` / `service`.

- `grindeasy tools list` — print core (always on), enabled extended, available
  (present but not enabled), declined, and custom, as themed panels.
- `grindeasy tools scan` — re-run `discoverExtended` and prompt for any newly
  found tools on demand (the same flow the first run uses).
- `grindeasy tools add` — interactive clack prompts: name → directory →
  extensions (comma-separated). Validates the directory exists (warn but allow if
  not). Appends to `config.customTools`.
- `grindeasy tools remove` — multiselect from enabled extended + custom; removes
  from `enabledToolIds` (adds to `declinedToolIds` so it is not re-offered) or
  from `customTools`.

Non-TTY invocations of `add`/`scan`/`remove` print usage and exit non-zero;
`list` still works (plain output).

## Onboarding flow (interactive, TTY only)

Order, as one continuous clack flow:

1. `banner()` (gradient ascent mark + wordmark).
2. `intro("grindeasy")`.
3. Tool discovery: spinner "Scanning for AI coding tools…" → `panel` of
   `tracking` (core + already-enabled, with active/recent markers) and `found`
   (new extended). If `newToOffer` non-empty, `multiselect`/`confirm` → persist
   `enabledToolIds` / `declinedToolIds`.
4. Leaderboard: the current `offerLeaderboard` logic, but as a clack `confirm`
   and only when eligible (`serverUrl && !accountToken && !askedToJoinBoard`).
   Persists `askedToJoinBoard` once, as today.
5. Service: the current `offerServiceInstall` logic as a clack `confirm`, same
   eligibility and once-only `askedToInstallService` guard. If it installs, the
   flow ends and the process exits (a service now owns tracking).
6. `outro` with tier badge + rank + dashboard URL.

Eligibility guards and the "asked once" flags are unchanged from today — only the
rendering and the fact that they share one flow are new.

## Error handling

- **Pairing failure** must never stop the agent (unchanged rule from
  `index.ts`): catch, warn via `theme.dim`, continue with `accountToken = ""`.
- **clack cancel** (Ctrl-C mid-flow): treat `isCancel` as "no" for that step and
  continue; a top-level cancel exits cleanly (`0`) after saving nothing new.
- **Non-TTY / piped / service**: `runOnboarding` is skipped entirely; the current
  plain `console.log` status block renders (via `colorEnabled()` returning false,
  so even shared `panel`/`banner` output degrades to plain ASCII).
- **`NO_COLOR`**: honored by `colorEnabled()` — structure/box characters may still
  print but no ANSI color escapes are emitted.
- **Unknown/absent tool directory**: `isPresent` is a guarded `existsSync`;
  errors are swallowed to `false`, consistent with `fsScan.ts`.

## Testing (vitest)

- `theme.ts`: with `NO_COLOR` set / `isTTY` false, `color`/`phosphor`/`panel`/
  `banner` emit **no** `\x1b[` sequences; with color enabled, `color('#82d399',x)`
  emits `38;2;130;211;153`. `panel` aligns columns to a stable width.
- `catalog.ts`: `isPresent` true/false against a temp dir; `discoverExtended`
  returns only present extended tools; core tools are never in the extended set.
- `config.ts`: `tools` → `customTools` migration runs once and is idempotent;
  absent `enabledToolIds`/`declinedToolIds` default to `[]`; tracked-set assembly
  = core + enabled extended + custom.
- Discovery selection logic: `newToOffer` excludes enabled and declined ids.

The clack flow itself (interactive I/O) is not unit-tested; its pure inputs
(discovery, selection, config mutation) are, and rendering is covered via
`theme.ts`.

## Dependencies

Add to `dependencies` (both ESM, Node ≥20, consistent with `"type": "module"`):

- `@clack/prompts` `^1.2.0`
- `picocolors` `^1.1.1`

`theme.ts` truecolor/gradient/box helpers are hand-rolled (no figlet /
gradient-string / lip-gloss dependency).

## Files touched

- New: `src/theme.ts`, `src/catalog.ts`, `src/onboarding.ts`,
  `test/theme.test.ts`, `test/catalog.test.ts`, `test/config.test.ts` (extend if
  present).
- Edit: `src/tools.ts`, `src/config.ts`, `src/index.ts`, `src/service.ts`,
  `src/types.ts` (if `OnboardingResult` lives there), `package.json`,
  `package-lock.json`, `README.md` (document `grindeasy tools`).

## Open decisions — resolved

- **Discovery model:** curated catalog probe + manual custom add (no heuristic
  sniffing).
- **Prompt timing:** first run + new arrivals, via `enabledToolIds` /
  `declinedToolIds`.
- **UI:** `@clack/prompts` + `picocolors`, reskinned to the phosphor-green brand;
  banner, boxed panels, themed gutter; no emojis.
- **Catalog width:** v1 ships only tools with a verified activity directory;
  presence-only tools are deferred.
- **New deps:** approved (`@clack/prompts`, `picocolors`).
