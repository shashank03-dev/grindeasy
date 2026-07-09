import { randomBytes, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { IngestBaseline } from "../core/ingest";
import type { BoardRow } from "../core/leaderboard";
import type { Plan } from "../core/types";
import { agentTokens, pairRequests, sessions, toolTotals, users } from "./schema";

/** Satisfied by both the Neon driver and the PGlite driver used in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof import("./schema")>;

export interface UserRecord {
  id: number;
  discordId: string;
  username: string;
  avatar: string | null;
  plan: Plan;
  combos: number;
}

/** Unambiguous alphabet: no I/L/O/0/1/U to survive being read aloud or retyped. */
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

function secretToken(): string {
  return randomBytes(32).toString("hex");
}

/** e.g. "KXQ4-9BTM". ~30^8 ≈ 6.5e11 possibilities, and rows expire in 10 minutes. */
export function newUserCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]!;
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

// ── users ────────────────────────────────────────────────────────────────────

export async function upsertUser(
  db: Db,
  discordId: string,
  username: string,
  avatar: string | null,
): Promise<UserRecord> {
  const [row] = await db
    .insert(users)
    .values({ discordId, username, avatar })
    .onConflictDoUpdate({ target: users.discordId, set: { username, avatar } })
    .returning();
  return row as UserRecord;
}

export async function getUserByDiscordId(db: Db, discordId: string): Promise<UserRecord | null> {
  const [row] = await db.select().from(users).where(eq(users.discordId, discordId)).limit(1);
  return (row as UserRecord) ?? null;
}

export async function setPlan(db: Db, userId: number, plan: Plan): Promise<void> {
  await db.update(users).set({ plan }).where(eq(users.id, userId));
}

export async function addCombos(db: Db, userId: number, n: number): Promise<void> {
  if (n <= 0) return;
  await db
    .update(users)
    .set({ combos: sql`${users.combos} + ${n}` })
    .where(eq(users.id, userId));
}

export async function creditTool(
  db: Db,
  userId: number,
  toolId: string,
  ms: number,
): Promise<void> {
  if (ms <= 0) return;
  await db
    .insert(toolTotals)
    .values({ userId, toolId, activeMs: ms })
    .onConflictDoUpdate({
      target: [toolTotals.userId, toolTotals.toolId],
      set: { activeMs: sql`${toolTotals.activeMs} + ${ms}` },
    });
}

export async function userToolTotals(db: Db, userId: number): Promise<Record<string, number>> {
  const rows = await db.select().from(toolTotals).where(eq(toolTotals.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.toolId, Number(r.activeMs)]));
}

/** One row per user with summed active time, ready for rankBoard(). */
export async function boardRows(db: Db): Promise<BoardRow[]> {
  const rows = await db
    .select({
      discordId: users.discordId,
      username: users.username,
      avatar: users.avatar,
      plan: users.plan,
      combos: users.combos,
      activeMs: sql<string>`coalesce(sum(${toolTotals.activeMs}), 0)`,
    })
    .from(users)
    .leftJoin(toolTotals, eq(toolTotals.userId, users.id))
    .groupBy(users.id);

  // sum() over bigint comes back as a string from Postgres.
  return rows.map((r) => ({ ...r, activeMs: Number(r.activeMs) }));
}

// ── sessions ─────────────────────────────────────────────────────────────────

export async function createSession(db: Db, userId: number): Promise<string> {
  const token = secretToken();
  await db.insert(sessions).values({ token, userId });
  return token;
}

export async function getSessionUser(db: Db, token: string): Promise<UserRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      discordId: users.discordId,
      username: users.username,
      avatar: users.avatar,
      plan: users.plan,
      combos: users.combos,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

// ── agent tokens (one per device) ────────────────────────────────────────────

export async function createAgentToken(db: Db, userId: number, label: string): Promise<string> {
  const token = secretToken();
  await db.insert(agentTokens).values({ token, userId, label: label.slice(0, 64) });
  return token;
}

export async function getAgentToken(
  db: Db,
  token: string,
): Promise<{ userId: number; baseline: IngestBaseline | null } | null> {
  const [row] = await db
    .select({ userId: agentTokens.userId, baseline: agentTokens.baseline })
    .from(agentTokens)
    .where(eq(agentTokens.token, token))
    .limit(1);
  return row ?? null;
}

export async function saveBaseline(
  db: Db,
  token: string,
  baseline: IngestBaseline,
): Promise<void> {
  await db
    .update(agentTokens)
    .set({ baseline, lastSeenAt: new Date() })
    .where(eq(agentTokens.token, token));
}

// ── pairing (device authorization) ───────────────────────────────────────────

export interface PairRequest {
  deviceCode: string;
  userCode: string;
}

export async function createPairRequest(db: Db, ttlMs: number): Promise<PairRequest> {
  const deviceCode = secretToken();
  const userCode = newUserCode();
  await db.insert(pairRequests).values({
    deviceCode,
    userCode,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return { deviceCode, userCode };
}

/** Look up a live, unclaimed, unconsumed request by its human-facing code. */
export async function findLivePairRequest(
  db: Db,
  userCode: string,
  now = new Date(),
): Promise<{ deviceCode: string; userId: number | null } | null> {
  const [row] = await db
    .select({ deviceCode: pairRequests.deviceCode, userId: pairRequests.userId })
    .from(pairRequests)
    .where(
      and(
        eq(pairRequests.userCode, userCode.trim().toUpperCase()),
        isNull(pairRequests.consumedAt),
        sql`${pairRequests.expiresAt} > ${now}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Bind a pending request to the user who just authorized it in the browser. */
export async function claimPairRequest(
  db: Db,
  userCode: string,
  userId: number,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(pairRequests)
    .set({ userId })
    .where(
      and(
        eq(pairRequests.userCode, userCode.trim().toUpperCase()),
        isNull(pairRequests.userId),
        isNull(pairRequests.consumedAt),
        sql`${pairRequests.expiresAt} > ${now}`,
      ),
    )
    .returning({ deviceCode: pairRequests.deviceCode });
  return rows.length > 0;
}

export type PollOutcome =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "ready"; accountToken: string };

/**
 * Exchange a device code for an agent token, exactly once.
 *
 * The consuming UPDATE is guarded on `consumed_at IS NULL` and returns the row
 * it changed, so two concurrent polls cannot both mint a token: Postgres
 * serializes them and the loser updates zero rows.
 */
export async function consumePairRequest(
  db: Db,
  deviceCode: string,
  label: string,
  now = new Date(),
): Promise<PollOutcome> {
  const [pending] = await db
    .select({ userId: pairRequests.userId, expiresAt: pairRequests.expiresAt })
    .from(pairRequests)
    .where(eq(pairRequests.deviceCode, deviceCode))
    .limit(1);

  if (!pending || pending.expiresAt <= now) return { status: "expired" };
  if (pending.userId === null) return { status: "pending" };

  const claimed = await db
    .update(pairRequests)
    .set({ consumedAt: now })
    .where(and(eq(pairRequests.deviceCode, deviceCode), isNull(pairRequests.consumedAt)))
    .returning({ userId: pairRequests.userId });

  if (claimed.length === 0 || claimed[0]!.userId === null) return { status: "expired" };

  const accountToken = await createAgentToken(db, claimed[0]!.userId, label);
  return { status: "ready", accountToken };
}
