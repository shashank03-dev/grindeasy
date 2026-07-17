import { getDb } from "@/lib/db";
import { failSlackConnection, findLiveSlackConnection, storeSlackWebhook } from "@/lib/db/queries";
import { loadEnv, slackConfigured } from "@/lib/env";
import { exchangeSlackCode } from "@/lib/slack";

/**
 * Step 2 of "Add to Slack": Slack sends the user back here after they pick a
 * channel. We exchange the code for the webhook and park it on the row for the
 * waiting agent, then send the browser to a page that says "return to your
 * terminal".
 *
 * `state` is the connect row's stateCode — no cookie is involved, because the
 * flow starts in a terminal and may finish in a different browser than the one
 * that started it (or on a phone).
 */
export async function GET(request: Request) {
  const env = loadEnv();
  const url = new URL(request.url);
  const done = (error?: string) =>
    Response.redirect(
      new URL(error ? `/slack/connect/done?error=${encodeURIComponent(error)}` : "/slack/connect/done", env.baseUrl),
    );

  if (!slackConfigured(env)) {
    return new Response("Slack is not configured on this server.", { status: 503 });
  }

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const denied = url.searchParams.get("error");

  // Without a live row there is no agent waiting and nowhere to record an
  // outcome, so this can only be a stale or forged link.
  const live = state ? await findLiveSlackConnection(getDb(), state) : null;
  if (!live) return done("expired");

  if (denied || !code) {
    await failSlackConnection(getDb(), state, denied === "access_denied" ? "you cancelled the Slack install" : "Slack sent no authorization code");
    return done("denied");
  }

  const result = await exchangeSlackCode({
    clientId: env.slackClientId,
    clientSecret: env.slackClientSecret,
    redirectUri: `${env.baseUrl}/api/slack/callback`,
    code,
  });

  if (!result.ok) {
    await failSlackConnection(getDb(), state, result.error);
    return done("exchange");
  }

  const stored = await storeSlackWebhook(getDb(), state, {
    webhookUrl: result.webhookUrl,
    channel: result.channel,
    teamName: result.teamName,
  });
  return stored ? done() : done("expired");
}
