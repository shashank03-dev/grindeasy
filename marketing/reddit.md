# Reddit

Reddit will kill you for self-promo faster than anywhere else, and a removed post
in r/ClaudeAI costs you that subreddit permanently. Read each sub's rules before
posting — several require a flair, some ban tool posts outside a weekly thread.

**One sub per day. Never cross-post the same text.** The mods of these subs overlap
and identical text across subreddits is what gets you shadowbanned.

Post from an account with real comment history. If your account has no karma and no
history, your post is auto-filtered and you'll never even see it happen.

---

## Tuesday — r/ClaudeAI (best fit, spend your best copy here)

Claude Code is the flagship tracked tool and this sub is full of people who leave it
running all day. Lead with the thing they'll recognize.

**Title:** I built a thing that shows Claude Code on your Discord profile while you're using it — and it never reads your code

**Body:**

> I leave Claude Code running most of the day and it always struck me as funny that
> Discord will happily tell everyone I'm playing a game, but has no idea I've been
> in a coding agent for six hours.
>
> So: grindeasy. It's a small local agent. It notices when you're actively in
> Claude Code (or Codex, Cursor, OpenCode, Gemini CLI, Aider — plus Zed, Continue,
> Copilot Chat, Cline if it finds them installed) and puts a live Rich Presence card
> on your Discord profile with the tool name and your active time.
>
> The bit I want to be upfront about, because it's the first thing I'd ask:
> **it never reads your code or your prompts.** It works out that a tool is "active"
> from one signal only — the modification time of that tool's own session files. It
> looks at *when* the file changed, never at what's in it. Your prompts, Claude's
> responses, file paths, API keys: it never opens any of it.
>
> By default nothing leaves your machine at all — it talks to your Discord desktop
> app and a dashboard on localhost, and that's the whole network surface. There's an
> opt-in leaderboard of active hours if you want to compare with other people; if you
> join it, what gets sent is: tool name, active minutes, combo count, plan label,
> Discord handle. Nothing else.
>
> Claude Code is picked up in the terminal *and* in the desktop app.
>
> `npx grindeasy` — needs Node 20+ and the Discord desktop app (Rich Presence doesn't
> work through web Discord). Free, MIT, and the leaderboard server is self-hostable
> with zero dependencies if you'd rather run your own.
>
> Source: https://github.com/shashank03-dev/grindeasy
>
> Happy to answer anything about the detection approach — it's deliberately the
> dumbest possible mechanism, which is the point.

---

## Tuesday alt — r/cursor and r/ChatGPTCoding

Same product, retarget the first line to their tool. **Rewrite the body, don't paste
the one above.** Swap "Claude Code" for "Cursor" / "Codex" in the opening hook and
keep the privacy paragraph intact — that paragraph is the load-bearing one everywhere.

r/ChatGPTCoding cares about Codex; r/cursor cares that it works alongside the editor
rather than replacing anything.

---

## Wednesday — r/SideProject

Different audience. They don't care about your privacy model, they care about the
build and the loop. Be a builder talking to builders. This is where stars come from.

**Title:** My side project's growth loop is just… the product. Every user becomes an ad on their own Discord profile.

**Body:**

> I built grindeasy — it puts a live card on your Discord profile showing which AI
> coding tool you're currently using (Claude Code, Codex, Cursor, and a few more),
> with your active hours and your rank on an opt-in leaderboard.
>
> The thing I didn't plan and now find kind of funny: the distribution *is* the
> product. Every person who installs it is broadcasting it, by design, to every dev
> server they're in, while they work. I didn't have to bolt a referral program onto
> it — the feature and the growth loop are the same object.
>
> Where I'm at, honestly: I just shipped it and almost nobody's used it yet. The
> leaderboard has about as many people on it as you'd expect for a project nobody's
> heard of. This post is me trying to fix that.
>
> Stack: TypeScript CLI, Next.js board, zero-dependency self-hostable server. MIT.
>
> https://github.com/shashank03-dev/grindeasy
>
> If you use an AI coding tool daily, `npx grindeasy` and you'll land near the top of
> a board that's still small.

That last line converts, and the honesty about the sparse board is not a weakness on
r/SideProject — it's the entry fee. That crowd rewards builders who post real numbers
and punishes ones who posture.

---

## Rules of engagement

- Answer every comment for the first three hours. Reddit's ranking is heavily weighted
  by early engagement; a post you abandon dies regardless of quality.
- Someone will accuse it of being spyware. Don't be defensive — explain the mtime
  mechanism plainly. That comment thread is usually the one that converts the sub,
  because you're being audited in public and passing.
- Someone will ask about tamper-proofing the board. The true answer: the agent
  self-reports and the server clamps deltas so you can't claim more time than has
  actually elapsed. It is not tamper-proof and you should say so.
