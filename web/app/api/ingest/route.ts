import { applyIngest, parsePayload } from "@/lib/core/ingest";
import { rankOf } from "@/lib/core/leaderboard";
import { getDb } from "@/lib/db";
import {
  addCombos,
  boardRows,
  creditTool,
  getAgentToken,
  getUserById,
  saveBaseline,
  setPlan,
  type Db,
} from "@/lib/db/queries";

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const db = getDb();

  const token = bearer(request);
  const record = token ? await getAgentToken(db, token) : null;
  if (!record) return Response.json({ ok: false, error: "invalid token" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) return Response.json({ ok: false, error: "invalid payload" }, { status: 400 });

  const result = applyIngest(record.baseline, payload, Date.now());
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "rate limited", retryAfterS: result.retryAfterS },
      { status: 429, headers: { "retry-after": String(result.retryAfterS) } },
    );
  }

  // Credits and the new baseline must land together. A partial write that
  // credited hours without advancing the baseline would let the next ingest
  // credit the same delta again.
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    for (const [toolId, ms] of Object.entries(result.creditedMsByTool)) {
      await creditTool(t, record.userId, toolId, ms);
    }
    await addCombos(t, record.userId, result.creditedCombos);
    await setPlan(t, record.userId, payload.plan);
    await saveBaseline(t, token, result.newBaseline);
  });

  // The agent's Discord card shows live rank, so the standing rides back on the
  // sync the agent already makes — no polling, no second endpoint. Read the
  // board directly rather than through getBoard(): that cache is 30s stale by
  // design, and we just wrote the credits this rank has to reflect.
  const user = await getUserById(db, record.userId);
  const standing = user ? rankOf(await boardRows(db), user.discordId) : null;

  return Response.json({
    ok: true,
    creditedMsByTool: result.creditedMsByTool,
    creditedCombos: result.creditedCombos,
    rank: standing?.rank ?? null,
    totalPlayers: standing?.totalPlayers ?? null,
  });
}
