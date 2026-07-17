import { getDb } from "@/lib/db";
import { createSlackConnection } from "@/lib/db/queries";
import { loadEnv, slackConfigured } from "@/lib/env";

/** How long the user has to finish the browser half of the Slack connect. */
const CONNECT_TTL_MS = 10 * 60_000;
/** How often the agent should poll. Echoed so the agent needn't hardcode it. */
const POLL_INTERVAL_S = 3;

/**
 * Step 1 of "Add to Slack". Unauthenticated by design: the webhook belongs to
 * whoever completes the browser flow, and no grindeasy account is involved.
 *
 * A 503 here is not a failure the user needs to see — it means this server has
 * no Slack app configured, and the agent quietly falls back to pasting a URL.
 */
export async function POST() {
  const env = loadEnv();
  if (!slackConfigured(env)) {
    return Response.json({ error: "Slack is not configured on this server" }, { status: 503 });
  }

  const { agentCode, stateCode } = await createSlackConnection(getDb(), CONNECT_TTL_MS);

  return Response.json({
    agentCode,
    connectUrl: `${env.baseUrl}/slack/connect?code=${encodeURIComponent(stateCode)}`,
    expiresInS: CONNECT_TTL_MS / 1000,
    intervalS: POLL_INTERVAL_S,
  });
}
