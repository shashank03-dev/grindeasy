import { getDb } from "@/lib/db";
import { findLiveSlackConnection } from "@/lib/db/queries";
import { loadEnv, slackConfigured } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/slack";

export const dynamic = "force-dynamic";

export default async function SlackConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "" } = await searchParams;
  const env = loadEnv();

  if (!slackConfigured(env)) {
    return (
      <Notice title="Slack isn't set up here">
        This server has no Slack app configured. Paste a webhook URL in your terminal instead.
      </Notice>
    );
  }

  if (!code) {
    return (
      <Notice title="No connect code">
        Start from your terminal with <Code>grindeasy webhook</Code>.
      </Notice>
    );
  }

  const live = await findLiveSlackConnection(getDb(), code);
  if (!live) {
    return (
      <Notice title="That link expired">
        Connect links last ten minutes. Run <Code>grindeasy webhook</Code> again for a fresh one.
      </Notice>
    );
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.slackClientId,
    redirectUri: `${env.baseUrl}/api/slack/callback`,
    state: code,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <Wordmark />
        <h1 className="font-heading text-3xl font-normal tracking-[-0.01em] [font-optical-sizing:auto] [font-variation-settings:'opsz'_144]">
          Connect Slack
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Slack will ask which channel to post in. Your weekly recap goes there, posted from your
          own machine.
        </p>
      </div>

      <a
        href={authorizeUrl}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground transition hover:opacity-90"
      >
        Add to Slack
      </a>

      <p className="text-xs text-muted-foreground/70">
        grindeasy never sees your messages and never posts on its own. The channel webhook is
        handed straight back to your terminal.
      </p>
    </main>
  );
}

function Wordmark() {
  return (
    <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      <span aria-hidden className="text-primary">▲</span> grindeasy
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-foreground">{children}</code>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <Wordmark />
      <h1 className="font-heading text-3xl font-normal tracking-[-0.01em] [font-optical-sizing:auto] [font-variation-settings:'opsz'_144]">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </main>
  );
}
