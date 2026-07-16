# Product Hunt — Friday

Honest expectation-setting first: Product Hunt is a weaker fit for grindeasy than
Discord, Reddit or HN. PH's audience is founders, makers and no-code people; your
user is someone who lives in a terminal and a Discord server. It's worth doing for
the backlink, the credibility badge and a long tail of traffic — but it is the least
important channel of your week, and it should not eat the energy that Discord seeding
deserves.

Ship it Friday, work the comments, don't build your week around it.

**Never launch Friday if you want to win the day** — traffic is lowest. Which is fine:
you're not optimizing for Product of the Day, you're optimizing for the listing to
exist and rank. If you *do* want to chase the badge, move this to a Tuesday next week.

---

## Name

grindeasy

## Tagline (60 char limit)

> See what you're coding with on your Discord profile

51 chars. Concrete, visual, no buzzwords. Resist "gamify", "AI-powered" and
"supercharge" — PH is saturated with them and they read as noise.

## Description (260 chars)

> grindeasy puts a live card on your Discord profile showing which AI coding tool
> you're actually using — Claude Code, Codex, Cursor, Gemini CLI and more. It never
> reads your code, only when your session files change. Free, open source, opt-in
> leaderboard.

## Topics

Developer Tools · Productivity · Open Source · Artificial Intelligence · Discord

## First comment (the maker comment — post at 12:01am PT)

> Hi PH 👋
>
> I use Claude Code most of the day, and it always struck me as slightly absurd that
> Discord will happily broadcast that I'm playing a game, but has no idea I've been
> inside a coding agent for six hours.
>
> grindeasy is a small local agent that fixes that. It works out which AI coding tool
> you're actively in and puts a live Rich Presence card on your Discord profile — the
> tool, your active time, and your rank if you choose to join the leaderboard.
>
> It handles Claude Code, Codex, OpenCode, Cursor, Gemini CLI and Aider out of the
> box, and finds Zed, Continue, Windsurf, Copilot Chat and Cline if you have them.
>
> The design decision I'm proudest of: **it never reads your code.** It decides a
> tool is "active" from one signal only — the modification time of that tool's session
> files. It looks at *when* they changed, never at what's inside. Your prompts, your
> code, your file paths and your keys never leave your machine, because the agent
> never opens them in the first place. By default nothing leaves your machine at all;
> the leaderboard is opt-in and sends aggregate numbers only.
>
> Free forever, MIT, and the leaderboard server is self-hostable with zero
> dependencies.
>
> `npx grindeasy` (Node 20+, Discord desktop app required for the card)
>
> The board is still young enough that if you install today you'll land near the top
> of it. I'll be here all day — ask me anything, especially about the detection
> approach.

---

## Gallery — the part that actually decides this

PH is scrolled visually. The gallery does more work than every word above.

1. **The card, on a real Discord profile, mid-session.** This is the hero image and
   it is not close. Real profile, real timer, `Coding · Claude Code`, rank line
   visible. No mockups.
2. **The GIF from `twitter.md`** — terminal starts a session, card goes live, timer
   ticks. Motion in the gallery stops the scroll.
3. **The leaderboard**, dark, populated. Only ship this shot if the board looks alive
   by Friday. If it doesn't, cut this slide entirely — an empty board slide actively
   costs you signups.
4. **The privacy table** from the README (leaves your machine / never leaves your
   machine). Rendered clean, dark, legible on mobile. This single image answers the
   objection before it forms.
5. **The install line.** `npx grindeasy`, big, on a dark terminal. End on the ask.

## On launch day

Answer every comment. PH's algorithm weights maker engagement and comment velocity,
and a maker who replies to all 20 comments outranks one who replies to none with twice
the upvotes. Don't ask for upvotes anywhere — PH will penalize you and it's against
their rules. Asking people to "come check it out and leave a comment" is fine and is
what everyone does.
