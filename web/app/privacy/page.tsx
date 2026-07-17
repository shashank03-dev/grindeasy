import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "grindeasy · privacy policy",
  description:
    "What grindeasy collects (tool names and active minutes, opt-in), what it never touches (your code, prompts and keys), and how the Slack and Discord integrations handle data.",
};

const CONTACT_EMAIL = "shashankgowda3162@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl uppercase tracking-[-0.01em] text-foreground sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-14">
      <header className="mb-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="text-primary">
            ▲
          </span>{" "}
          <Link href="/" className="transition-colors hover:text-foreground">
            grindeasy
          </Link>
        </p>
        <h1 className="mt-5 font-display text-5xl uppercase leading-[0.92] tracking-[-0.01em] text-foreground sm:text-6xl">
          Privacy policy
        </h1>
        <p className="mt-4 font-mono text-[13px] text-muted-foreground/70">
          Last updated: July 17, 2026
        </p>
      </header>

      <p className="mt-8 max-w-[65ch] text-[15px] leading-relaxed text-muted-foreground">
        grindeasy is a local agent that shows which AI coding tools you use. It is local-first
        by design: by default nothing leaves your machine, and when you opt in to the
        leaderboard, the only thing that ever syncs is tool names and active minutes. This
        page describes exactly what is collected, by whom, and what never is.
      </p>

      <Section title="The local agent">
        <p>
          The agent decides a tool is &ldquo;active&rdquo; from one signal only: the
          modification time of that tool&rsquo;s own session files. It never opens or reads
          those files. By default it talks to your Discord desktop app (for Rich Presence)
          and a dashboard on <code className="font-mono text-foreground">localhost</code>,
          and nothing else. No data leaves your machine until you explicitly link a
          leaderboard account.
        </p>
      </Section>

      <Section title="What syncs if you join the leaderboard (opt-in)">
        <p>If you link an account, each sync from your machine sends only:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>tool identifiers (e.g. &ldquo;claude-code&rdquo;, &ldquo;cursor&rdquo;)</li>
          <li>cumulative active minutes per tool</li>
          <li>combo counts (how often you ran multiple tools at once)</li>
          <li>a plan label (API / PRO / MAX)</li>
          <li>the agent version, and whether a tool is active right now</li>
        </ul>
        <p>
          Signing in uses Discord OAuth with the <code className="font-mono">identify</code>{" "}
          scope only. We receive your Discord ID, username and avatar — not your email, not
          your messages, not your server list.
        </p>
      </Section>

      <Section title="What we never collect">
        <p>
          Your code, prompts, AI responses, file names, file paths, API keys and auth tokens
          never leave your machine — the agent has no code path that reads them. The website
          sets no analytics or advertising trackers.
        </p>
      </Section>

      <Section title="What is public">
        <p>
          The leaderboard displays your Discord username and avatar alongside your rank,
          tier, plan tag and active time. Joining the board means agreeing to that being
          visible to anyone.
        </p>
      </Section>

      <Section title="The Slack integration">
        <p>
          Connecting Slack uses OAuth with the{" "}
          <code className="font-mono">incoming-webhook</code> scope only: you pick a single
          channel and Slack issues a webhook for it. Our server holds that webhook briefly —
          in a short-lived, single-use handshake record — solely to hand it to the agent
          running on your machine, along with the workspace and channel name shown during
          setup. The server never posts to your Slack; every message comes from your own
          machine. Handshake records expire and are consumed on first use. Removing the app
          from your Slack workspace revokes the webhook immediately.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We set a session cookie when you sign in and short-lived (10-minute) state cookies
          during the OAuth redirect. That is all — no analytics cookies, no third-party
          cookies.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Leaderboard data is kept while your account exists. To delete your account and all
          associated data, or to revoke a paired device, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          from a way that proves control of the Discord account, and we will remove it.
          Deleting a user removes all their totals, sessions and device tokens.
        </p>
        <p>
          The leaderboard server is open source and self-hostable — if you would rather no
          third party hold your minutes at all, you can run your own.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes materially, the &ldquo;last updated&rdquo; date above
          changes with it. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <p className="mt-16 text-xs text-muted-foreground/70">
        <Link href="/" className="transition-colors hover:text-foreground">
          ← back to grindeasy
        </Link>
      </p>
    </main>
  );
}
