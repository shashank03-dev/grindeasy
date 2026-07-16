# Show HN — Thursday

**Do not post this until the board has rows on it.** HN sends a spike of people who
click through to grindeasy.tech within 90 seconds. If they land on a leaderboard with
one name, the project reads as dead and the thread dies. You get one Show HN.

Post **Tue–Thu, 8–10am ET**. Be at your desk for the following four hours. On HN, the
comment section *is* the product — an unattended Show HN is a wasted one.

---

## Title

Show HN: Grindeasy – Discord Rich Presence for Claude Code, Codex and other AI CLIs

80 chars, says exactly what it is, names the tools people search for. Don't be clever.
HN punishes clever titles.

Do not put "leaderboard" or "gamified" in the title. HN's reflex against gamification
is instant, and the card is the honest hook anyway.

**URL:** https://github.com/shashank03-dev/grindeasy — link the repo, not the landing
page. Show HN skews toward the code, and your repo is genuinely good. They'll find the
site from the README.

---

## First comment (post it immediately, as the author)

> Author here. Discord will tell everyone you're playing a game, but has no idea
> you've been in a coding agent for six hours. grindeasy is a small local agent that
> fixes that: it notices which AI coding tool you're actively using and puts a live
> Rich Presence card on your Discord profile — tool name, active time, and your rank
> if you've opted into the leaderboard.
>
> It tracks Claude Code, Codex, OpenCode, Cursor, Gemini CLI and Aider out of the box,
> and probes for Zed, Continue, Windsurf, Copilot Chat, Cline, Roo and Kilo, offering
> once to add any it finds.
>
> The detection is deliberately the dumbest thing that can work, and that's the design:
> it decides a tool is active from **the modification time of that tool's own session
> files, and nothing else**. It never opens them. It cannot see your code, your
> prompts, the model's responses, your file paths or your keys, because it never reads
> a byte of any of it. Copilot is the one that needed care — it watches the Copilot
> *Chat* session files specifically, so hand-editing code in VS Code with the
> extension installed never counts as AI activity.
>
> By default the whole thing is local: it talks to your Discord desktop app and a
> dashboard on localhost, and makes no other network calls. The leaderboard is opt-in.
> If you join it, the payload is tool name, active minutes, combo count, plan label
> and Discord handle — that's the complete list.
>
> Two things I'd rather say myself than have found:
>
> 1. **The board is not tamper-proof and I don't claim it is.** The agent self-reports
> and the server only credits sanity-clamped deltas, so you can't claim more time than
> has actually elapsed — but a determined person can obviously lie to it. It's a
> leaderboard for people who want one, not an audit log.
>
> 2. **On Windows the background service is a hidden supervisor loop** registered under
> HKCU\...\Run, and some antivirus/SmartScreen setups reasonably flag that pattern. If
> yours does, allow it or just keep a terminal open with `npx grindeasy`.
>
> Needs Node 20+ and the Discord desktop app (Rich Presence doesn't go through web or
> mobile). The leaderboard server is in server/ — MIT, zero dependencies,
> self-hostable if you'd rather not use mine.
>
> Scoring is hours + combos × 0.25. The API/PRO/MAX badge on a row is context only and
> never weights the score — I didn't want a board that rewards spend.
>
> `npx grindeasy`

## Why it's written that way

You volunteer the two weaknesses — tamper-proofing and the Windows Run-key —
before anyone finds them. On HN this is not a liability, it's the single highest-value
move available to you. The commenter who was going to dunk on you now has nothing to
say, and the room reads you as trustworthy, which is exactly the disposition you need
them in when they evaluate a tool that watches their filesystem.

The privacy mechanism goes high because it is the first thing HN will attack and the
place where you are strongest. "It reads the clock, not the file" is a genuinely good
sentence and it will get quoted.

## Have these ready

**"So it's WakaTime."** WakaTime tracks editor time on a dashboard you have to go
open. This tracks which *agent* you're in and surfaces it where your friends already
are. Related, not the same.

**"Why would I want my employer/friends seeing my hours?"** You wouldn't, sometimes —
which is why it's local by default, the board is opt-in, and Discord's own activity
privacy toggle turns the card off. Say this plainly, it's a fair question.

**"mtime is a crude signal — false positives?"** Yes, and be honest about the shape of
it: a tool whose session file is touched by a background process could read as active.
In practice the session files only move when you're in a session. It's the tradeoff
that buys never having to read the file.

**"Zero dependencies, really?"** Yes, for the server. Let them check. They will.
