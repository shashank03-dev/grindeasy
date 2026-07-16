# Twitter/X

Two moments this week. Monday is the demo — it exists to be seen, not read. Wednesday
is the privacy thread — it exists to be believed.

The card is a *visual* product. Every post here needs the GIF or the screenshot.
A tweet about grindeasy with no image is a wasted tweet.

---

## Post 1 — Monday. The demo.

> my discord profile now shows which AI tool i'm actually coding with, live, while
> i code
>
> claude code, codex, cursor, opencode, gemini cli, aider — it picks up whichever
> one you're in and puts it on the card with your active time
>
> `npx grindeasy`
>
> free, open source, and it never reads your code 👇

[Attach: the GIF. See the shot list below.]

Why this works: it's a *screenshot-native* product. You're not describing a feature,
you're showing a thing that appears on their profile. The reply guy asking "how does
it know?" is the point — that's the setup for Wednesday.

---

## Post 2 — Wednesday. The privacy thread.

This is the thread that earns trust, and trust is what converts installs into
leaderboard opt-ins. It's also pre-loading your Hacker News answers.

**1/**
> "how does it know what you're coding with without reading your code"
>
> it doesn't read your code. it reads the *clock*.
>
> here's the whole trick, it's dumber than you think 🧵

**2/**
> every AI coding tool writes session files somewhere on your disk.
>
> claude code → ~/.claude
> codex → its own session dir
> cursor, opencode, gemini cli, aider → same deal
>
> when you're mid-session, those files get touched. constantly.

**3/**
> so grindeasy watches one thing: the *modification time* of those files.
>
> file changed in the last few minutes → you're active in that tool.
> file hasn't moved → you're not.
>
> that's it. it never opens the file. it doesn't need to.

**4/**
> which means the stuff that never leaves your machine is:
>
> your code. your prompts. the model's responses. file names. paths. api keys.
> auth tokens.
>
> it physically can't send them. it never reads them.

**5/**
> what leaves, and ONLY if you opt into the leaderboard:
>
> tool name, active minutes, combo count, plan label, discord handle.
>
> that's the entire payload. by default there's no account and nothing is sent at
> all — it just talks to your discord app and a dashboard on localhost.

**6/**
> the leaderboard is opt-in, the server is MIT and self-hostable with zero
> dependencies, and you can read every line:
>
> https://github.com/shashank03-dev/grindeasy
>
> `npx grindeasy`

**7/** (only post this one if the board has real rows on it by Wednesday)
> board's still small enough that if you install today you land near the top of it.
>
> that will not be true in a month.

---

## Shot list for the GIF

You need one good asset and it carries the entire week. ~6 seconds, loops:

1. Discord profile card, idle, no activity. (1s — establishes the "before")
2. Cut to terminal, `claude` starts, a session begins.
3. Cut back to the profile — the card is now live: `Coding · Claude Code`, the
   elapsed timer ticking, `◆ Bronze`, the rank line.
4. Hold on the ticking timer. (2s — the timer moving is the whole magic)

Record it on your own real profile. Do not mock it up. The single most persuasive
frame in this entire launch is a real Discord card with a timer that is visibly
counting.

---

## Replying

Two questions will dominate and you should have the answers pasted and ready:

**"how is this different from wakatime"** — wakatime tracks editor time and lives on
a dashboard you open. grindeasy tracks *which AI agent* you're in and puts it on your
Discord profile where your friends already are. Different surface, different point.

**"so it's spyware"** — no, and it's the reason for Wednesday's thread. Link it.
Don't get defensive, just show the mechanism. The mechanism is genuinely clean and
it wins the argument on its own.
