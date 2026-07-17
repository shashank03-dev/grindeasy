const MESSAGES: Record<string, { title: string; body: string }> = {
  denied: {
    title: "Slack install cancelled",
    body: "Nothing was saved. Your terminal will say the same thing in a moment — run `grindeasy webhook` again whenever you want to retry.",
  },
  expired: {
    title: "That link expired",
    body: "Connect links last ten minutes. Run `grindeasy webhook` again for a fresh one.",
  },
  exchange: {
    title: "Slack couldn't finish the install",
    body: "Slack rejected the authorization, so nothing was saved. Your terminal has the specific reason.",
  },
};

const SUCCESS = {
  title: "Slack connected",
  body: "Return to your terminal — it'll pick this up within a few seconds and ask you to confirm the channel. You can close this tab.",
};

/**
 * `error` is a URL parameter, so it can name an inherited property: plain
 * `MESSAGES[error]` answers a truthy Function for `constructor` or `toString`,
 * which slips past a `??` fallback and renders a blank page. Only own keys count.
 */
function messageFor(error: string | undefined): { title: string; body: string } {
  if (!error) return SUCCESS;
  return Object.hasOwn(MESSAGES, error) ? MESSAGES[error]! : MESSAGES.exchange!;
}

export default async function SlackConnectDonePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { title, body } = messageFor(error);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span aria-hidden className="text-primary">▲</span> grindeasy
      </p>
      <h1 className="font-heading text-3xl font-normal tracking-[-0.01em] [font-optical-sizing:auto] [font-variation-settings:'opsz'_144]">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </main>
  );
}
