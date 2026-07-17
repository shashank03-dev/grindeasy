import { getDb } from "@/lib/db";
import { consumeSlackConnection } from "@/lib/db/queries";

interface PollBody {
  agentCode?: unknown;
}

/**
 * Step 3 of "Add to Slack". The agent polls with its secret code until the
 * browser half resolves, then receives the webhook exactly once.
 *
 * Returns 200 for "pending" rather than an error: that is the expected state for
 * most of the poll loop, not a failure.
 */
export async function POST(request: Request) {
  let body: PollBody;
  try {
    body = (await request.json()) as PollBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const agentCode = typeof body.agentCode === "string" ? body.agentCode : "";
  if (!agentCode) return Response.json({ error: "agentCode required" }, { status: 400 });

  const outcome = await consumeSlackConnection(getDb(), agentCode);
  return Response.json(outcome);
}
