# ⚡ viberank

**Show what you're actively coding with — right on your Discord profile — and climb the tiers.**

viberank is a tiny local agent that watches which AI coding tools you're *actively*
using (Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Aider), shows a live
**Discord Rich Presence** card, tracks your personal **tier** (Bronze → Diamond)
and **achievements**, and can sync to a **global leaderboard** with
`[API] / [PRO] / [MAX]` badges (see [`server/`](./server) — self-hostable, zero deps).

Free forever. If it makes your day a little better, [buy the author a coffee](#support).

```
  Coding · Claude Code + Codex
  ◆ Platinum · PRO      ⏱ 2h 14m
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
git clone https://github.com/shashank03-dev/viberank
cd viberank
npm install
npm start
```

On first run it creates `~/.viberank/config.json` and prints setup help.
Open the local dashboard at **http://localhost:4599**.

## Enable the Discord card (2 minutes)

Tracking works immediately, but the Discord card needs a free Application ID:

1. Go to <https://discord.com/developers/applications> → **New Application** → name it `viberank`.
2. Copy the **Application ID**.
3. Under **Rich Presence → Art Assets**, upload an image named **`viberank`**
   (512×512). Optionally add `pro`, `max`, `api` icons for the small badge.
4. Paste the ID into `~/.viberank/config.json`:
   ```json
   { "discordClientId": "YOUR_APPLICATION_ID" }
   ```
5. In Discord: **Settings → Activity Privacy → Share your activity** must be on.
6. Make sure the Discord desktop app is running, then `npm start` again.

Your card appears on your profile whenever a tracked tool is active.

## Configuration

`~/.viberank/config.json`:

| Key | Default | Meaning |
|---|---|---|
| `discordClientId` | `""` | Your Discord Application ID (required for the card) |
| `declaredPlan` | `"pro"` | `"pro"` or `"max"` — used only if you're on a subscription (API is auto-detected) |
| `pollIntervalMs` | `5000` | How often to check for activity |
| `activeWindowMs` | `60000` | A tool is "active" if its files changed within this window |
| `comboBucketMs` | `300000` | Combo window: 2+ tools active in the same window = 1 combo |
| `statsPort` | `4599` | Local dashboard port |
| `donateUrl` | Buy Me a Coffee | Where the support button points |
| `showIdlePresence` | `true` | Keep the card up (showing your tier) when idle |
| `serverUrl` | `""` | Leaderboard server base URL (empty = sync off) |
| `accountToken` | `""` | Your agent token from the server's `/me` page (empty = sync off) |
| `syncIntervalMs` | `300000` | How often totals are pushed to the leaderboard |
| `tools` | `[]` | Override tool detection (id, name, activityDirs, extensions) |

## Join the global leaderboard (optional)

1. Open a viberank server (self-host one in 2 minutes — see [`server/README.md`](./server/README.md)).
2. Click **Log in with Discord** → your `/me` page shows an **agent token**.
3. Put `serverUrl` and `accountToken` into `~/.viberank/config.json` and restart.

The agent then pushes your *aggregate totals* every 5 minutes. The server credits
only sanity-clamped deltas (you can't claim more time than actually elapsed), so
the board stays fair. One board for everyone — the API/PRO/MAX badge is context,
never a score multiplier.

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
- **Next** — a hosted public instance, more tools, supporter cosmetics.

## Support

If viberank is useful to you, a coffee keeps it going: set your own link in
`donateUrl`, or support the project via the link on the dashboard. Thank you 🙏

## License

MIT — see [LICENSE](./LICENSE).
