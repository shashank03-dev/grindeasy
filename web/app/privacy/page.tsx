import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "grindeasy · privacy policy",
  description:
    "What grindeasy collects (tool names and active minutes, opt-in), what it never touches (your code, prompts and keys), and how the Slack and Discord integrations handle data.",
};

const CONTACT_EMAIL = "shashankgowda3162@gmail.com";

// Each section is a row on the page grid: a numbered heading in the left
// columns, the text in a readable measure on the right.
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-10 md:grid-cols-12 md:gap-10">
      <div className="md:col-span-4">
        <p className="font-pixel text-[15px] text-signal">{String(n).padStart(2, "0")}</p>
        <h2 className="mt-3 text-[22px] font-medium leading-tight tracking-[-0.02em] text-paper md:text-[26px]">
          {title}
        </h2>
      </div>
      <div className="max-w-[64ch] space-y-4 text-[15px] leading-relaxed text-muted-foreground md:col-span-7 md:col-start-6 [&_code]:text-paper [&_strong]:text-paper">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="relative z-10 w-full px-4 pb-24 pt-28 md:px-10 md:pt-36">
        <header className="grid gap-8 pb-14 md:grid-cols-12">
          <div className="md:col-span-8">
            <p className="label text-muted-foreground">Privacy policy</p>
            <h1 className="display mt-6 text-[clamp(3rem,8vw,8.5rem)] text-paper">
              It never reads your code.
            </h1>
          </div>
          <div className="flex flex-col justify-end gap-4 md:col-span-4">
            <p className="label text-muted-foreground/80">Last updated · July 17, 2026</p>
            <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
              grindeasy is a local agent that shows which AI coding tools you use. It is local-first
              by design: by default nothing leaves your machine, and when you opt in to the
              leaderboard, the only thing that ever syncs is tool names and active minutes. This
              page describes exactly what is collected, by whom, and what never is.
            </p>
          </div>
        </header>

      <Section n={1} title="The local agent">
        <p>
          The agent decides a tool is &ldquo;active&rdquo; from one signal only: the
          modification time of that tool&rsquo;s own session files. It never opens or reads
          those files. By default it talks to your Discord desktop app (for Rich Presence)
          and a dashboard on <code className="font-mono text-foreground">localhost</code>,
          and nothing else. No data leaves your machine until you explicitly link a
          leaderboard account.
        </p>
      </Section>

      <Section n={2} title="What syncs if you join the leaderboard (opt-in)">
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

      <Section n={3} title="What we never collect">
        <p>
          Your code, prompts, AI responses, file names, file paths, API keys and auth tokens
          never leave your machine — the agent has no code path that reads them. The website
          sets no analytics or advertising trackers.
        </p>
      </Section>

      <Section n={4} title="What is public">
        <p>
          The leaderboard displays your Discord username and avatar alongside your rank,
          tier, plan tag and active time. Joining the board means agreeing to that being
          visible to anyone.
        </p>
      </Section>

      <Section n={5} title="The Slack integration">
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

      <Section n={6} title="Cookies">
        <p>
          We set a session cookie when you sign in and short-lived (10-minute) state cookies
          during the OAuth redirect. That is all — no analytics cookies, no third-party
          cookies.
        </p>
      </Section>

      <Section n={7} title="Retention and deletion">
        <p>
          Leaderboard data is kept while your account exists. To delete your account and all
          associated data, or to revoke a paired device, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-paper underline decoration-signal underline-offset-4">
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

      <Section n={8} title="Changes and contact">
        <p>
          If this policy changes materially, the &ldquo;last updated&rdquo; date above
          changes with it. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-paper underline decoration-signal underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

        <p className="border-t border-line pt-10">
          <Link href="/" className="bracket">
            Back to grindeasy
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
