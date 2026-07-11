<div align="center">

<img src="assets/discord/grindeasy.png" alt="grindeasy" width="96" height="96" />

# ⚡ grindeasy

**See what you're coding with on your Discord profile, and climb the tiers.**

[![npm](https://img.shields.io/npm/v/grindeasy?style=flat-square&color=f2b705&logo=npm&logoColor=white&label=npm)](https://www.npmjs.com/package/grindeasy)
[![node](https://img.shields.io/node/v/grindeasy?style=flat-square&color=f2b705&logo=nodedotjs&logoColor=white&label=node)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/grindeasy?style=flat-square&color=f2b705&label=license)](./LICENSE)
[![local-first](https://img.shields.io/badge/telemetry-opt--in-f2b705?style=flat-square)](#privacy-first)

</div>

```
  Coding · Claude Code + Codex
  #12 on grindeasy · ◆ Platinum · PRO      ⏱ 2h 14m
```

<div align="center">

[Install](#install) · [Privacy](#privacy-first) · [Keep it running](#keep-it-running) · [Leaderboard](#the-leaderboard) · [Support](#support)

</div>

---

grindeasy is a tiny local agent. It watches which AI coding tools you're actually
using — Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Aider — and puts a live
Discord Rich Presence card on your profile while you work. It tracks a personal
tier (Bronze up to Diamond) and a set of achievements, and if you opt in, it
feeds a global leaderboard that tags each player `API` / `PRO` / `MAX`. The
server lives in [`server/`](./server): self-hostable, zero dependencies.

Your rank rides on the card and moves while you work. The board catches up within
a minute of the time being earned.

Free forever. If it makes your day a little better, [buy the author a coffee](#support).

## Privacy first

Read this part, because it's the whole point. The agent decides a tool is
"active" from one thing only: the modification time of that tool's own session
files. It never opens them.

| Leaves your machine (only if you link a leaderboard account) | Never leaves your machine |
|---|---|
| tool name, active minutes, combo count, plan label, Discord handle | your code, prompts, responses, file names and paths, API keys, auth tokens |

By default the agent is entirely local. It talks to your Discord desktop app and
a dashboard on `localhost`, and nothing else. Leaderboard sync is opt-in and
sends aggregate numbers only. The whole thing is open source, so you can check
every line yourself.

## Install

You'll need **Node.js 20 or newer** and the **Discord desktop app** — Rich
Presence only works through the desktop client, not the web or mobile apps.

```bash
npx grindeasy
```

That's the setup. The card shows up on your profile the moment a tracked tool is
active. No Developer Portal, no art assets, no config file to hand-edit. On the
first run it asks once whether you want to join the global leaderboard; say yes
and it pairs in your browser with a single click (no token to copy). Say no and
it stays local.

The dashboard is at **http://localhost:4599**.

## Keep it running

`npx grindeasy` only counts while that terminal stays open. To keep tracking
after you close it, and across reboots, install it as a background service:

```bash
grindeasy service install     # start tracking in the background
grindeasy service status      # rank, hours, sync, is it running?
grindeasy service uninstall   # stop; your token and stats are kept
```

Right after you join the leaderboard, grindeasy offers to do this for you — press
enter and you're done. The service runs whenever you're logged in, and restarts
itself if it ever crashes.

| Platform | Mechanism | Restarts on crash | Survives reboot |
|---|---|---|---|
| Linux | systemd **user** unit (`~/.config/systemd/user/`) | yes | yes (login-linger) |
| macOS | launchd **LaunchAgent** (`~/Library/LaunchAgents/`) | yes | yes (at login) |
| Windows | `HKCU…\Run` entry to a hidden supervisor loop | yes | yes (at login) |

No admin, no sudo, no UAC prompt on any platform. It's all per-user. Run
`grindeasy` again while the service is up and it just prints the status; it won't
start a second tracker.

> **Windows note:** the supervisor is a hidden auto-restart loop, and some
> antivirus or SmartScreen setups treat that as suspicious. If it gets blocked,
> either allow it or just keep a terminal open with `npx grindeasy`.

## The Discord card

The card works out of the box. grindeasy ships its own Discord application, so
there's nothing to create and nothing to upload. Two things have to be true on
your side:

1. The **Discord desktop app is running** (Rich Presence goes through the desktop
   client; the web and mobile apps can't show it).
2. **Settings → Activity Privacy → Share your activity** is on.

That's it. The card appears whenever a tracked tool is active.

<details>
<summary>Using your own Discord application instead</summary>

Only needed if you want your own branding on the card. Create an application at
<https://discord.com/developers/applications>, upload the images from
[`assets/discord/`](./assets/discord) under **Rich Presence → Art Assets** with
these *exact* asset keys (Discord asset keys can't be renamed after upload):

| File | Asset key | Used as |
|---|---|---|
| `assets/discord/grindeasy.png` | `grindeasy` | large image |
| `assets/discord/api.png` | `api` | small badge, API-key plan |
| `assets/discord/pro.png` | `pro` | small badge, Pro plan |
| `assets/discord/max.png` | `max` | small badge, Max plan |

Then set `discordClientId` in `~/.grindeasy/config.json` to your Application ID.
To rebuild the PNGs from source, run `node assets/discord/src/build.mjs`.

</details>

## The leaderboard

Opt-in. Nothing leaves your machine until you say yes. The agent offers once on
first run; if you decline, or you're not on a terminal, you can join later:

```bash
grindeasy login
```

Pairing is a device flow, like `gh auth login`: you approve a short code in the
browser and the agent writes its own token. There's no token to copy and no file
to edit.

Once paired, the agent pushes your aggregate totals every minute while you're
coding, and backs off to every five minutes when you're idle. The server credits
only sanity-clamped deltas, so you can't claim more time than actually elapsed,
and it answers each push with your current rank. That rank is what puts
`#12 on grindeasy` on your card. One board for everyone; the API/PRO/MAX badge is
context, never a score multiplier.

If the board is unreachable, or you never joined, the card just drops the rank
line and everything else keeps working.

> Cursor, Gemini CLI and Aider detection is best-effort, since their session
> layouts change between versions. If one isn't picked up on your machine,
> override its `activityDirs` through `tools` in the config.

## How scoring works

- **Active time** counts only while a tool is actually working (its session files
  are changing). App open but idle overnight earns nothing.
- **Combos** are two or more tools active in the same five-minute window. They
  reward skill, not spend, so they stay fair across plans on the board.
- **Tiers** come from `hours + combos × 0.25` XP: Bronze (0), Silver (10),
  Gold (40), Platinum (100), Diamond (250). Personal, and they never reset.

## Configuration

`~/.grindeasy/config.json`:

| Key | Default | Meaning |
|---|---|---|
| `discordClientId` | grindeasy's own app | Override only to use your own Discord application |
| `declaredPlan` | `"pro"` | `"pro"` or `"max"` — used only on a subscription (API is auto-detected) |
| `pollIntervalMs` | `5000` | How often to check for activity |
| `activeWindowMs` | `60000` | A tool is "active" if its files changed within this window |
| `comboBucketMs` | `300000` | Combo window: 2+ tools active in the same window = 1 combo |
| `statsPort` | `4599` | Local dashboard port |
| `donateUrl` | Buy Me a Coffee | Where the support button points |
| `showIdlePresence` | `true` | Keep the card up (showing your tier) when idle |
| `serverUrl` | hosted board | Leaderboard server base URL (empty = sync off) |
| `accountToken` | `""` | Written by pairing — you never set this by hand (empty = sync off) |
| `syncIntervalMs` | `300000` | How often totals are pushed while idle (min 60000) |
| `activeSyncIntervalMs` | `60000` | How often totals are pushed while you're coding (min 60000) |
| `askedToJoinBoard` | `false` | Set once we've offered the leaderboard, so you're never asked twice |
| `askedToInstallService` | `false` | Set once we've offered the background service, so you're never asked twice |
| `tools` | `[]` | Override tool detection (id, name, activityDirs, extensions) |

## Roadmap

- **Phase 1 (done)** — local agent, Discord card, active-time tracking, personal
  tiers, local dashboard. Claude Code + Codex + OpenCode.
- **Phase 2 (done)** — backend with "Login with Discord", global leaderboard,
  plan badges, anti-cheat ingest. See [`server/`](./server).
- **Phase 3 (done)** — Cursor / Gemini CLI / Aider detection, achievements, CI,
  Docker deploy.
- **Phase 4 (done)** — zero-step install, live rank on the card, minute-fresh
  board sync.
- **Phase 5 (done, 0.3.3)** — background service installer (`grindeasy service`
  install/uninstall/status) for Linux, macOS and Windows, with a duplicate-run
  guard.
- **Next** — more tools, supporter cosmetics.

## Support

If grindeasy is useful to you, a coffee keeps it going: set your own link in
`donateUrl`, or use the support button on the dashboard. Thank you.

## License

MIT — see [LICENSE](./LICENSE).

<div align="center">
<sub>The npm package named <code>grindeasy</code> is this project. A similarly
named package by anyone else isn't.</sub>
</div>
