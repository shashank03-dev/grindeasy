import { getDb } from "@/lib/db";
import { findLiveSlackConnection } from "@/lib/db/queries";
import { loadEnv, slackConfigured } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/slack";
import { Cmd, NoticeShell, NoticeText } from "@/components/site/notice-shell";

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
        Start from your terminal with <Cmd>grindeasy webhook</Cmd>.
      </Notice>
    );
  }

  const live = await findLiveSlackConnection(getDb(), code);
  if (!live) {
    return (
      <Notice title="That link expired">
        Connect links last ten minutes. Run <Cmd>grindeasy webhook</Cmd> again for a fresh one.
      </Notice>
    );
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.slackClientId,
    redirectUri: `${env.baseUrl}/api/slack/callback`,
    state: code,
  });

  return (
    <NoticeShell eyebrow="Weekly recap · Slack" title="Connect Slack">
      <NoticeText>
        Slack will ask which channel to post in. Your weekly recap goes there, posted from your own
        machine.
      </NoticeText>

      <a href={authorizeUrl} className="slab w-full justify-center">
        Add to Slack <span aria-hidden>→</span>
      </a>

      <p className="text-xs leading-relaxed text-muted-foreground/80">
        grindeasy never sees your messages and never posts on its own. The channel webhook is
        handed straight back to your terminal.
      </p>
    </NoticeShell>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <NoticeShell eyebrow="Weekly recap · Slack" title={title}>
      <NoticeText>{children}</NoticeText>
    </NoticeShell>
  );
}
