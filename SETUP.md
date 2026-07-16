# grindeasy setup — the simple version

This is the plain-English guide for someone installing grindeasy for the first
time. No jargon. If a word needs explaining, it gets explained right here.

If you want the full technical detail instead, read the [README](./README.md).

---

## What grindeasy does, in one line

It shows which AI coding tool you are using right now (like Claude Code or Cursor)
as a live card on your Discord profile, and puts your coding hours on a shared
leaderboard if you want it to.

Think of how Discord shows your friends when you are playing a game. grindeasy
does the same thing, but for coding.

---

## Before you start

You need two things installed already:

1. **Node.js, version 20 or newer.** This is the program that runs grindeasy. If
   you write code with AI tools, you very likely already have it. To check, open a
   terminal and type `node --version`. If you see a number like `v20` or higher,
   you are set. If not, install it from [nodejs.org](https://nodejs.org).

2. **The Discord desktop app** (the one you download and install, not the version
   in a web browser). The coding card can only show up through the desktop app.
   The website and phone app cannot display it.

---

## Step 1 — run it

Open a terminal and type this one line:

```bash
npx grindeasy
```

That is the whole install. `npx` is a tool that comes with Node.js. It downloads
grindeasy, runs it, and you are going. There is nothing to sign up for and no
file to edit by hand.

---

## Step 2 — the questions it asks the first time

The first time you run it, grindeasy asks you a few things. Here is what each one
means so you are not guessing.

**"Scanning for AI coding tools…"**
It looks around your computer for coding tools it knows about. Six are always
watched: Claude Code, Codex, OpenCode, Cursor, Gemini CLI, and Aider. If it spots
others you have installed (like Zed or GitHub Copilot Chat), it lists them.

**"Add these to tracking?"**
If it found extra tools, it asks whether you want those counted too. Say yes to
track them, or leave them out. Whatever you decline, it will not ask about again.

**"Join the global leaderboard?"**
This is the one real choice. Say **yes** and your coding hours get compared with
other people on a public board at [grindeasy.tech](https://grindeasy.tech). Say
**no** and grindeasy stays entirely on your own machine and sends nothing anywhere.
You can join later any time by running `grindeasy login`.

If you say yes, your browser opens and you approve a short code with one click.
There is no password and no token to copy.

**"Keep grindeasy tracking in the background?"**
Say yes and grindeasy keeps running even after you close the terminal, and starts
again on its own when you restart your computer. This is the recommended answer.
More on this in Step 4.

---

## Step 3 — see the card on Discord

For the card to appear, two things need to be true in Discord:

1. The **Discord desktop app is open and running**.
2. Go to **Settings → Activity Privacy** and turn on **"Share your activity."**
   Discord ships with this on by default, but it is worth checking.

Now start coding with any tracked tool. Within a few seconds, a card appears on
your Discord profile showing the tool name and a timer counting up. That is it
working.

---

## Step 4 — keep it running after you close the terminal

When you run `npx grindeasy` in a terminal, it only tracks while that terminal
stays open. Close the window and it stops.

To keep it going all the time, install it as a background service:

```bash
grindeasy service install
```

Now it runs quietly on its own, restarts if it ever crashes, and comes back after
a reboot. No admin rights or password needed. Two more commands you might want:

```bash
grindeasy service status      # is it running? what is my rank and hours?
grindeasy service uninstall   # stop it (your stats and login are kept)
```

If you said yes to the background question in Step 2, this is already done for you.

---

## The dashboard on your own machine

While grindeasy runs, it also serves a small private page at:

```
http://localhost:4599
```

Open that in your browser to see your own stats: your hours, your tier, your
current tool. This page is only on your computer. Nobody else can see it.

---

## What the words on the card mean

- **Active time** — the hours you spent actually working in a tool. If a tool is
  open but you walked away, that idle time does not count.
- **Tier** — a rank you earn from your hours, going Bronze, Silver, Gold,
  Platinum, Diamond. It only ever goes up. It never resets.
- **Combo** — using two tools in the same short window (for example Claude Code
  and Codex together). Combos give a small bonus. They reward skill, not how much
  you pay for your plan.
- **Rank** — your position on the shared leaderboard, like `#12`. Only shows if
  you joined the board.
- **Plan** — a small label (API, PRO, or MAX) showing which kind of subscription
  you use. It is only a label. It never boosts your score.

---

## Privacy, in plain words

This is the part worth understanding, because it is the whole design.

grindeasy figures out that you are "using" a tool by checking the *time stamp* on
that tool's own files, the way you can see when a document was last saved without
opening it. It never opens those files. It never sees your code, your prompts, the
AI's answers, your file names, or your keys.

- If you do **not** join the leaderboard, nothing at all leaves your computer.
- If you **do** join, the only things sent are: the tool name, your active
  minutes, your combo count, your plan label, and your Discord handle. Nothing
  else.

The whole project is open source, so anyone can read every line and check this is
true.

---

## If something is not working

**The card does not show up.**
Check that the Discord *desktop* app is running (not the browser), and that
Settings → Activity Privacy → "Share your activity" is on. The card only appears
while a tracked tool is actively being used, so start coding first.

**My hours are not counting.**
grindeasy only counts time when a tool's files are actually changing. Having the
app open but sitting idle earns nothing. This is on purpose.

**(Windows) something got blocked.**
The background service uses a small auto-restart helper that some antivirus tools
treat as suspicious. Either allow it, or skip the background service and just keep
a terminal open with `npx grindeasy`.

**I want to stop everything.**
Run `grindeasy service uninstall`. Your login and stats are kept in case you come
back.

---

## The short version

```bash
npx grindeasy                 # install and run
# say yes to the leaderboard if you want a rank
grindeasy service install     # keep it running in the background
```

Open Discord desktop, start coding, and watch the card appear. That is the entire
thing.
