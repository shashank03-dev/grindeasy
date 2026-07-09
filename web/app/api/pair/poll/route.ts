import { getDb } from "@/lib/db";
import { consumePairRequest } from "@/lib/db/queries";

interface PollBody {
  deviceCode?: unknown;
  label?: unknown;
}

/**
 * Step 2 of device authorization. The agent polls with its device code until a
 * human authorizes it, then receives an agent token exactly once.
 *
 * Returns 200 for "pending" rather than an error: this is the expected state
 * for most of the poll loop, not a failure.
 */
export async function POST(request: Request) {
  let body: PollBody;
  try {
    body = (await request.json()) as PollBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
  if (!deviceCode) return Response.json({ error: "deviceCode required" }, { status: 400 });

  const label = typeof body.label === "string" && body.label.trim() ? body.label : "unnamed device";

  const outcome = await consumePairRequest(getDb(), deviceCode, label);
  return Response.json(outcome);
}
