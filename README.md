# ⚡ grindboard

**Show what you're actively coding with — right on your Discord profile — and climb the tiers.**

grindboard is a tiny local agent that watches which AI coding tools you're *actively*
using (Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Aider), shows a live
**Discord Rich Presence** card, tracks your personal **tier** (Bronze → Diamond)
and **achievements**, and streams your standing to a **global leaderboard** with
`[API] / [PRO] / [MAX]` badges (see [`server/`](./server) — self-hostable, zero deps).

Your rank rides on the card and moves while you work — the board updates within a
minute of the time being earned.

Free forever. If it makes your day a little better, [buy the author a coffee](#support).

```
  Coding · Claude Code + Codex
  #12 on grindboard · ◆ Platinum · PRO      ⏱ 2h 14m
```

---

## 🔒 Privacy first (read this)

The agent decides a tool is "active" purely from the **modification time of that
tool's own session files** — it **never reads their contents**.

| Leaves your machine (only if YOU link a leaderboard account) | **Never** leaves your machine |
|---|---|
| tool name, active minutes, combo count, plan label, Discord handle | your code, prompts, responses, file names/paths, API keys, auth tokens |

By default the agent is **100% local** — it talks only to your local Discord
desktop app and a dashboard on `localhost`. Leaderboard sync is opt-in and sends
aggregates only. The whole project is open source so you can verify every line.

---

## Install & run

Requires **Node.js ≥ 20** and the **Discord desktop app** (Rich Presence works
through the desktop client, not the web/mobile app).

```bash
npx grindboard
```

That's the whole setup. The card appears on your profile as soon as a tracked
tool is active — no Discord Developer Portal, no art assets, no config file to
edit. On first run it asks once whether you'd like to join the global
leaderboard; say yes and it pairs itself in your browser (one click, no token to
copy). Say no and it stays entirely local.

Open the local dashboard at **http://localhost:4599**.

> The npm name `grindboard` belongs to an unrelated project, which is why the
> package is scoped.

## The Discord card

The card works out of the box — grindboard ships its own Discord application, so
there is nothing to create and nothing to upload. Two things must be true on
your side:

1. The **Discord desktop app is running** (Rich Presence goes through the
   desktop client — the web and mobile apps can't show it).
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
| `assets/discord/grindboard.png` | `grindboard` | large image |
| `assets/discord/api.png` | `api` | small badge, API-key plan |
| `assets/discord/pro.png` | `pro` | small badge, Pro plan |
| `assets/discord/max.png` | `max` | small badge, Max plan |

Then set `discordClientId` in `~/.grindboard/config.json` to your Application ID.
To regenerate the PNGs from source, run `node assets/discord/src/build.mjs`.

</details>

## Configuration

`~/.grindboard/config.json`:

| Key | Default | Meaning |
|---|---|---|
| `discordClientId` | grindboard's own app | Override only to use your own Discord application |
| `declaredPlan` | `"pro"` | `"pro"` or `"max"` — used only if you're on a subscription (API is auto-detected) |
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
| `tools` | `[]` | Override tool detection (id, name, activityDirs, extensions) |

## The global leaderboard

**Opt-in.** Nothing is sent anywhere until you say yes. The agent offers once on
first run; if you decline (or you're not on a terminal), you can join later with:

```bash
grindboard login
```

Either way, pairing is a device flow like `gh auth login` — you authorize a short
code in the browser and the agent writes its own token. There's no token to copy
and no file to edit.

Once paired, the agent pushes your *aggregate totals* every minute while you're
actively coding, and backs off to every 5 minutes when idle. The server credits
only sanity-clamped deltas (you can't claim more time than actually elapsed), and
answers each push with your current rank — which is what puts `#12 on grindboard`
on your card. One board for everyone; the API/PRO/MAX badge is context, never a
score multiplier.

If the board is unreachable, or you never joined, the card simply drops the rank
line and everything else keeps working.

> Cursor, Gemini CLI and Aider detection is best-effort (session layouts vary by
> version). If one isn't detected on your machine, override its `activityDirs`
> via `tools` in the config.

## How scoring works

- **Active time** — only counts while a tool is actually working (its session
  files are changing). App open but idle overnight earns nothing.
- **Combos** — using two+ tools in the same 5-minute window. Combos reward skill,
  not spend, so they'll be fair across plans on the leaderboard.
- **Tiers** — `hours + combos × 0.25` XP → Bronze (0) · Silver (10) · Gold (40)
  · Platinum (100) · Diamond (250). Personal, never resets.

## Roadmap

- **Phase 1 (done)** — local agent, Discord card, active-time tracking,
  personal tiers, local dashboard. Claude Code + Codex + OpenCode.
- **Phase 2 (done)** — backend with "Login with Discord", global leaderboard,
  plan badges, anti-cheat ingest. See [`server/`](./server).
- **Phase 3 (done)** — Cursor / Gemini CLI / Aider detection, achievements, CI,
  Docker deploy.
- **Phase 4 (done)** — zero-step install, live rank on the card, minute-fresh
  board sync.
- **Next** — more tools, supporter cosmetics.

## Support

If grindboard is useful to you, a coffee keeps it going: set your own link in
`donateUrl`, or support the project via the link on the dashboard. Thank you 🙏

## License

MIT — see [LICENSE](./LICENSE).
