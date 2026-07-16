# grindeasy launch week

Version at launch: **0.5.0** (live on npm). Site: **grindeasy.tech** (live).

## Where you actually stand

The leaderboard has **one row on it** — yours.

npm shows 580 downloads, but all 580 landed on a single day (Jul 11) with zero on
every other day. That's the shape of registry mirrors and scrapers hitting a fresh
publish, not 580 people. **Treat your real user count as approximately zero.**

That is not a bug and there is nothing to fix in the funnel — the board prompt
defaults to yes and only appears on a TTY, which is correct. You just have no
distribution yet. Nobody has heard of it.

So the job this week is not "convert more installers." It's "get the first hundred
humans to run `npx grindeasy` at all." Everything below is aimed at that, and at one
constraint: **the board is the product's proof.** A visitor who lands on
grindeasy.tech and sees a single name assumes the project is dead. Seeding it is not
optional before the one-shot channels fire.

## Order of operations

Seeding channels first, one-shot channels last. Hacker News and Product Hunt do not
give you a second attempt, so they go last in the week, aimed at a board that has
people on it.

| Day | Channel | Asset | Goal |
|---|---|---|---|
| Mon | Discord servers you're already in | `discord-seed.md` | 30–60 people on the board |
| Mon | Twitter/X — the card demo | `twitter.md` (Post 1) | Card GIF gets seen |
| Tue | r/ClaudeAI, r/cursor, r/ChatGPTCoding | `reddit.md` | The audience that owns these tools |
| Wed | Twitter/X — the privacy thread | `twitter.md` (Thread) | The defensible angle |
| Wed | r/SideProject, r/opensource | `reddit.md` | Builder crowd, stars |
| **Thu** | **Show HN** | `hn.md` | The one-shot. Board must look alive. |
| **Fri** | **Product Hunt** | `product-hunt.md` | The other one-shot. |

Do not run HN and Product Hunt on the same day. You cannot be present in two comment
sections at once, and presence in the comments is most of what decides both.

## Gate before Thursday

Before you post to HN, open grindeasy.tech in an incognito window and look at it the
way a stranger will. If the board still has fewer than ~25 rows, **push HN and PH to
next Monday and keep seeding.** Everything else in the week still runs. This is the
only checkpoint that's worth delaying for.

## Positioning

The three things that are true, in the order they persuade:

1. **The card.** Your Discord profile shows which AI tool you're using, live, while
   you code, with your rank on it. Nobody else does this for Claude Code / Codex.
2. **The privacy model.** It reads *modification times* of session files. Never
   opens them. No code, no prompts, no paths leave your machine. This is the claim
   that survives Hacker News, and it's why it goes near the top everywhere.
3. **Free, open source, self-hostable server, zero dependencies.**

What NOT to lead with: tiers, XP, achievements, combos. They're the retention
mechanic, not the hook. Lead with them and it reads as gamified noise — which
PRODUCT.md explicitly says the product isn't.

## Honesty rules for every post

- No invented numbers, and **do not cite the 580 downloads as users** — they're
  almost certainly bots, someone will call it, and getting caught inflating on HN or
  Reddit is unrecoverable. You have no traction yet. On r/SideProject and HN, saying
  so plainly is an asset; everywhere else, just don't raise the topic.
- Don't imply the board is tamper-proof. The agent self-reports and the server
  clamps deltas. If someone asks on HN, say exactly that — it's a better answer
  than a dodge, and someone will check.
- It's `npx grindeasy`, Node 20+, and it needs the **Discord desktop app**. State
  the desktop requirement up front. People whose card silently doesn't appear
  because they're on web Discord will churn and say it's broken.
