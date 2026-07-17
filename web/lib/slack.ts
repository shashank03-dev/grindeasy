/**
 * Slack OAuth v2, scope "incoming-webhook" only. The user picks one channel and
 * Slack mints a webhook bound to it; we hand that webhook straight back to the
 * agent and keep nothing. No bot token is stored, and the server never posts.
 */

const SLACK_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const SLACK_ACCESS = "https://slack.com/api/oauth.v2.access";

export interface SlackWebhook {
  webhookUrl: string;
  /** Channel Slack bound the webhook to, e.g. "#standup". */
  channel: string;
  teamName: string;
}

export type SlackExchange = ({ ok: true } & SlackWebhook) | { ok: false; error: string };

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL(SLACK_AUTHORIZE);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("scope", "incoming-webhook");
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

/** Shape of the fields we read from oauth.v2.access. */
interface AccessResponse {
  ok?: boolean;
  error?: string;
  team?: { name?: string };
  incoming_webhook?: { url?: string; channel?: string };
}

/**
 * Trade the callback's `code` for the webhook Slack just created. Never throws
 * on a Slack-side refusal: the caller records `error` on the row so the waiting
 * agent gets a real message instead of a timeout.
 */
export async function exchangeSlackCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<SlackExchange> {
  const fetchFn = opts.fetchFn ?? fetch;

  let data: AccessResponse;
  try {
    const res = await fetchFn(SLACK_ACCESS, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }).toString(),
    });
    if (!res.ok) return { ok: false, error: `Slack returned HTTP ${res.status}` };
    data = (await res.json()) as AccessResponse;
  } catch {
    return { ok: false, error: "could not reach Slack" };
  }

  if (!data.ok) return { ok: false, error: data.error || "Slack rejected the authorization" };

  const webhookUrl = data.incoming_webhook?.url;
  if (!webhookUrl) return { ok: false, error: "Slack returned no webhook URL" };

  return {
    ok: true,
    webhookUrl,
    channel: data.incoming_webhook?.channel ?? "your channel",
    teamName: data.team?.name ?? "your workspace",
  };
}
