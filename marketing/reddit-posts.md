# Reddit — ready to post

Fresh bodies for the push. The existing `reddit.md` covers r/ClaudeAI, r/cursor,
r/ChatGPTCoding and r/SideProject, plus the posting rules. This file adds new
subreddits and an alternate ClaudeAI angle. Same discipline applies:

- One sub per day. Never paste the same body in two subs — the mods overlap and
  identical text is what gets you shadowbanned.
- Read each sub's rules first. Some want a flair, some only allow tool posts in a
  weekly thread.
- Post from an account with real history, then sit in the replies for the first
  three hours. An abandoned post dies no matter how good it is.

---

## r/selfhosted — lead with the server, not the card

This crowd doesn't care about your Discord profile. They care that the thing
you're asking them to run is auditable and doesn't phone home. That's exactly the
part of grindeasy that's strongest here.

**Title:** I built a coding-activity leaderboard where the whole server is MIT and has zero dependencies, so you can host your own

**Body:**

> grindeasy is a small local agent that tracks which AI coding tool you're
> actively using (Claude Code, Codex, Cursor, and a few more) and can push your
> active hours to a leaderboard. The part I think this sub will actually care
> about: the leaderboard server is open source, MIT, and has zero runtime
> dependencies. You can run the whole thing yourself and point the agent at it.
>
> By default the agent is fully local — it talks to your Discord desktop app and a
> dashboard on localhost and nothing else. The public board is opt-in. If you
> self-host, nothing touches my server at all.
>
> How it decides a tool is "active" is deliberately dumb: it watches the
> modification time of that tool's session files. It never opens them. So it can't
> read your code, prompts, or keys even if it wanted to — there's no code path that
> does.
>
> Agent: `npx grindeasy` (Node 20+). Server lives in the repo under `server/`.
>
> https://github.com/shashank03-dev/grindeasy
>
> Happy to answer anything about the sync protocol or the clamp logic on the
> server side.

---

## r/opensource — the growth loop is the honest hook here

**Title:** My open source side project's entire growth loop is a feature, not a referral program

**Body:**

> I made grindeasy — it puts a live card on your Discord profile showing which AI
> coding tool you're using right now, with your hours and your rank on an opt-in
> leaderboard. TypeScript agent, Next.js board, self-hostable MIT server.
>
> The thing I didn't design on purpose: every person who runs it is broadcasting
> it to every dev server they're in, while they work. The feature and the
> distribution are the same object. I never had to bolt on a "refer a friend"
> anything.
>
> Where it actually stands: I just shipped it and almost nobody uses it yet. The
> board has about as many rows as a project nobody's heard of would have. I'm not
> going to pretend otherwise. If you run an AI coding tool daily and want to kick
> the tires, `npx grindeasy` and you'll be near the top of a board that's still
> small.
>
> https://github.com/shashank03-dev/grindeasy
>
> Open to PRs and to being told what's wrong with it.

---

## r/discordapp — this is a Discord feature first

Frame it as "a use of Rich Presence you haven't seen," because that's what it is
to this audience.

**Title:** Made a tool that shows your live coding activity as Discord Rich Presence — which AI tool, your hours, a rank

**Body:**

> You know how a game shows up on your Discord profile with a timer? grindeasy does
> that for AI coding tools. When you're actively in Claude Code, Codex, Cursor,
> OpenCode, Gemini CLI or Aider, a card appears on your profile: the tool name, an
> elapsed timer, your tier, and your rank on an optional leaderboard.
>
> It ships its own Discord application, so there's nothing to create in the
> Developer Portal and no art to upload. Two things have to be true on your side:
> the Discord desktop app is running (Rich Presence doesn't work on web or mobile),
> and Activity Privacy → Share your activity is on. Then the card just shows up.
>
> It figures out you're active from the timestamps on each tool's session files,
> never their contents. It never reads your code.
>
> `npx grindeasy` (needs Node 20+). Free and open source.
>
> https://github.com/shashank03-dev/grindeasy

---

## r/ClaudeAI — alternate angle (if you'd rather not use the one in reddit.md)

Use this only if you want a second option. The reddit.md version leads with
privacy; this one leads with the feeling of the thing.

**Title:** Discord shows everyone when I'm gaming but had no idea I'd been in Claude Code for 6 hours. So I built the card for it.

**Body:**

> I leave Claude Code running most of my working day, and it always bugged me a
> little that my Discord profile would happily announce a 20-minute game session
> and stay completely silent about six hours of actual work.
>
> grindeasy fixes exactly that one thing. It's a small local agent that notices
> when you're actively in Claude Code (or Codex, Cursor, OpenCode, Gemini CLI,
> Aider) and puts a live card on your profile: the tool, a running timer, your
> tier, your rank on an opt-in board.
>
> The obvious question is how it knows without reading anything sensitive. It reads
> the modification time of the tool's own session files and nothing else. Not the
> contents. Your prompts, Claude's replies, file paths, keys — it never opens any
> of it. By default nothing leaves your machine at all.
>
> Claude Code is picked up whether you run it in the terminal or the desktop app.
>
> `npx grindeasy`, needs Node 20+ and the Discord desktop app. MIT, and the board
> server is self-hostable.
>
> https://github.com/shashank03-dev/grindeasy

---

## The two questions that decide every thread

Have these pasted and ready before you post anywhere:

**"so it's spyware / how is this not a keylogger"** — Don't get defensive. Explain
the mtime mechanism plainly: it looks at *when* a file changed, never at what's
inside. That thread is usually the one that converts the sub, because you're being
audited in public and passing.

**"what stops people faking their hours"** — Tell the truth: the agent
self-reports and the server clamps each update so you can't claim more time than
has actually elapsed. It is not tamper-proof and you should say so. This sub
respects that answer more than a claim of perfect integrity.
