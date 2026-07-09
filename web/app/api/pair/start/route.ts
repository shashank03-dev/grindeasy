import { getDb } from "@/lib/db";
import { createPairRequest } from "@/lib/db/queries";
import { loadEnv } from "@/lib/env";

/** How long the user has to finish the browser half of pairing. */
const PAIR_TTL_MS = 10 * 60_000;
/** How often the agent should poll. Echoed so the agent needn't hardcode it. */
const POLL_INTERVAL_S = 3;

/**
 * Step 1 of device authorization. Unauthenticated by design: a device code on
 * its own grants nothing until a logged-in human claims its user code.
 */
export async function POST() {
  const env = loadEnv();
  const { deviceCode, userCode } = await createPairRequest(getDb(), PAIR_TTL_MS);

  return Response.json({
    deviceCode,
    userCode,
    verifyUrl: `${env.baseUrl}/pair?code=${encodeURIComponent(userCode)}`,
    expiresInS: PAIR_TTL_MS / 1000,
    intervalS: POLL_INTERVAL_S,
  });
}
