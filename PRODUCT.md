# grindeasy

## What it is

A local agent that watches which AI coding tools you are *actively* using (Claude Code,
Codex, OpenCode, Cursor, Gemini CLI, Aider), shows a live Discord Rich Presence card, and
pushes your active time to a public leaderboard.

Activity is inferred from the modification times of each tool's own session files. The agent
never reads their contents. Nothing leaves the machine until you pair a leaderboard account.

## Register

`product` — the leaderboard is a tool surface, not a marketing page. Design serves the data.

## Who uses it

Developers who spend their working day inside a terminal and a coding agent, and who care
which of their peers is putting in the hours. They already live in dark interfaces. They will
screenshot their rank and post it in a Discord server.

## The scene

A developer, 1am, one monitor, room lit only by the screen. They alt-tab from a terminal to
check whether they have passed the person above them. The board is a thing you glance at
between compiles, then close. It should feel like part of the terminal, not a website that
happens to be dark.

That sentence forces the theme: **dark**. Not because developer tools are cool dark, but
because this surface is opened in a dark room, next to a dark terminal, for five seconds at
a time.

## What the board must convey

1. **Rank** — the number, unambiguous, first.
2. **Who** — Discord avatar + display name.
3. **Time** — active hours. The unit of the whole product.
4. **Tier** — Bronze / Silver / Gold / Platinum / Diamond, earned from XP.
5. **Combos** — using two tools in the same 5-minute window. Rewards skill, not spend.
6. **Plan** — API / PRO / MAX. Context, never a score multiplier.

## Constraints

- Scoring is `hours + combos × 0.25`. Plan never weights it. This is a fairness promise and
  the design must not imply otherwise (no gold-plating MAX users).
- Tiers are five categorical values. They are *data* colors, not brand accents.
- The board is server-rendered and read far more often than it changes; agents push every
  five minutes.
- Most rows are ordinary. The design should make rank 1 feel earned without making rank 47
  feel like an error state.

## Non-goals

- Gamified noise: no confetti, no streak fire, no XP bars that fill on load.
- Implying the board is tamper-proof. The agent self-reports; the server clamps.
