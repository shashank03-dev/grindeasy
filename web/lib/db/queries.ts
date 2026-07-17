import { randomBytes, randomInt } from "node:crypto";
import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { IngestBaseline } from "../core/ingest";
import type { BoardRow } from "../core/leaderboard";
import type { Plan } from "../core/types";
import {
  agentTokens,
  dailyCombos,
  dailyToolTotals,
  pairRequests,
  sessions,
  slackConnections,
  toolTotals,
  users,
} from "./schema";

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

export async function getUserById(db: Db, id: number): Promise<UserRecord | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
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

// ── daily buckets (the weekly board's time dimension) ────────────────────────
// The same clamped deltas that go into creditTool/addCombos, additionally
// recorded against the UTC day they were credited. Written in the same ingest
// transaction, so the two ledgers never drift.

export async function creditDailyTool(
  db: Db,
  userId: number,
  day: string,
  toolId: string,
  ms: number,
): Promise<void> {
  if (ms <= 0) return;
  await db
    .insert(dailyToolTotals)
    .values({ userId, day, toolId, activeMs: ms })
    .onConflictDoUpdate({
      target: [dailyToolTotals.userId, dailyToolTotals.day, dailyToolTotals.toolId],
      set: { activeMs: sql`${dailyToolTotals.activeMs} + ${ms}` },
    });
}

export async function addDailyCombos(
  db: Db,
  userId: number,
  day: string,
  n: number,
): Promise<void> {
  if (n <= 0) return;
  await db
    .insert(dailyCombos)
    .values({ userId, day, combos: n })
    .onConflictDoUpdate({
      target: [dailyCombos.userId, dailyCombos.day],
      set: { combos: sql`${dailyCombos.combos} + ${n}` },
    });
}

/**
 * Record that a user is actively coding right now. Called only on *active*
 * ingests, so `lastActiveAt`'s freshness is the online signal — it stops
 * advancing the moment the user goes idle. See core/presence.ts `isOnline`.
 */
export async function setPresence(
  db: Db,
  userId: number,
  activeNow: string[],
  now = new Date(),
): Promise<void> {
  await db.update(users).set({ lastActiveAt: now, activeNow }).where(eq(users.id, userId));
}

/** Presence inputs for one user, for the live "online" dot on their card. */
export interface UserPresence {
  lastActiveAt: Date | null;
  activeNow: string[] | null;
  /** Newest heartbeat across the user's devices — the fallback for old agents. */
  lastSeenAt: Date | null;
}

export async function getUserPresence(db: Db, userId: number): Promise<UserPresence> {
  const [u] = await db
    .select({ lastActiveAt: users.lastActiveAt, activeNow: users.activeNow })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [seen] = await db
    .select({ lastSeenAt: sql<string | null>`max(${agentTokens.lastSeenAt})` })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId));
  // A raw max() skips drizzle's timestamp mapping, so the driver may hand back a
  // string; normalize to a Date (or null).
  return {
    lastActiveAt: u?.lastActiveAt ?? null,
    activeNow: u?.activeNow ?? null,
    lastSeenAt: seen?.lastSeenAt ? new Date(seen.lastSeenAt) : null,
  };
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

/**
 * BoardRow per user for one inclusive day-key range [start, end], summing the
 * daily buckets. Only users with activity in the range appear — an empty week is
 * an empty board, not the whole field at zero.
 */
export async function weeklyBoardRows(db: Db, start: string, end: string): Promise<BoardRow[]> {
  const toolRows = await db
    .select({
      userId: dailyToolTotals.userId,
      activeMs: sql<string>`sum(${dailyToolTotals.activeMs})`,
    })
    .from(dailyToolTotals)
    .where(between(dailyToolTotals.day, start, end))
    .groupBy(dailyToolTotals.userId);

  const comboRows = await db
    .select({ userId: dailyCombos.userId, combos: sql<string>`sum(${dailyCombos.combos})` })
    .from(dailyCombos)
    .where(between(dailyCombos.day, start, end))
    .groupBy(dailyCombos.userId);

  const activeByUser = new Map(toolRows.map((r) => [r.userId, Number(r.activeMs)]));
  const combosByUser = new Map(comboRows.map((r) => [r.userId, Number(r.combos)]));

  const ids = [...activeByUser.keys()];
  if (ids.length === 0) return [];

  const meta = await db
    .select({
      id: users.id,
      discordId: users.discordId,
      username: users.username,
      avatar: users.avatar,
      plan: users.plan,
    })
    .from(users)
    .where(inArray(users.id, ids));

  return meta.map((u) => ({
    discordId: u.discordId,
    username: u.username,
    avatar: u.avatar,
    plan: u.plan,
    activeMs: activeByUser.get(u.id) ?? 0,
    combos: combosByUser.get(u.id) ?? 0,
  }));
}

export interface UserWeek {
  toolTotalsMs: Record<string, number>;
  combos: number;
  /** Total active ms per day, aligned index-for-index to the given day keys. */
  perDay: number[];
}

/** One user's activity across a set of days: by-tool totals, combos, and the
 *  per-day series the card's histogram renders. */
export async function userWeek(db: Db, userId: number, days: string[]): Promise<UserWeek> {
  const start = days[0]!;
  const end = days[days.length - 1]!;

  const toolRows = await db
    .select({
      day: dailyToolTotals.day,
      toolId: dailyToolTotals.toolId,
      activeMs: dailyToolTotals.activeMs,
    })
    .from(dailyToolTotals)
    .where(and(eq(dailyToolTotals.userId, userId), between(dailyToolTotals.day, start, end)));

  const comboRows = await db
    .select({ combos: dailyCombos.combos })
    .from(dailyCombos)
    .where(and(eq(dailyCombos.userId, userId), between(dailyCombos.day, start, end)));

  const toolTotalsMs: Record<string, number> = {};
  const msByDay = new Map<string, number>();
  for (const r of toolRows) {
    const ms = Number(r.activeMs);
    toolTotalsMs[r.toolId] = (toolTotalsMs[r.toolId] ?? 0) + ms;
    msByDay.set(r.day, (msByDay.get(r.day) ?? 0) + ms);
  }
  const combos = comboRows.reduce((sum, r) => sum + r.combos, 0);
  return { toolTotalsMs, combos, perDay: days.map((d) => msByDay.get(d) ?? 0) };
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

// ── Slack connect ("Add to Slack") ───────────────────────────────────────────
// Same two-code shape as pairing, for a different payload: the browser half ends
// with Slack handing us a webhook, and the agent half collects it exactly once.

export interface SlackConnection {
  /** Secret; the agent polls with it. Never travels through the browser. */
  agentCode: string;
  /** Travels as the OAuth `state`, so this is the half Slack and the browser see. */
  stateCode: string;
}

export async function createSlackConnection(db: Db, ttlMs: number): Promise<SlackConnection> {
  const agentCode = secretToken();
  const stateCode = secretToken();
  await db.insert(slackConnections).values({
    agentCode,
    stateCode,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return { agentCode, stateCode };
}

/** A connect attempt that is still unexpired, unconsumed, and unresolved. */
export async function findLiveSlackConnection(
  db: Db,
  stateCode: string,
  now = new Date(),
): Promise<{ agentCode: string } | null> {
  const [row] = await db
    .select({ agentCode: slackConnections.agentCode })
    .from(slackConnections)
    .where(
      and(
        eq(slackConnections.stateCode, stateCode),
        isNull(slackConnections.consumedAt),
        sql`${slackConnections.expiresAt} > ${now}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Record the webhook Slack just minted. Guarded on the row still being live and
 * not already resolved, so a replayed callback cannot overwrite a webhook the
 * agent is about to collect.
 */
export async function storeSlackWebhook(
  db: Db,
  stateCode: string,
  webhook: { webhookUrl: string; channel: string; teamName: string },
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(slackConnections)
    .set({ webhookUrl: webhook.webhookUrl, channel: webhook.channel, teamName: webhook.teamName })
    .where(
      and(
        eq(slackConnections.stateCode, stateCode),
        isNull(slackConnections.webhookUrl),
        isNull(slackConnections.error),
        isNull(slackConnections.consumedAt),
        sql`${slackConnections.expiresAt} > ${now}`,
      ),
    )
    .returning({ agentCode: slackConnections.agentCode });
  return rows.length > 0;
}

/** Mark the attempt failed so the polling agent stops with a reason, not a timeout. */
export async function failSlackConnection(
  db: Db,
  stateCode: string,
  error: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(slackConnections)
    .set({ error })
    .where(
      and(
        eq(slackConnections.stateCode, stateCode),
        isNull(slackConnections.webhookUrl),
        isNull(slackConnections.error),
        isNull(slackConnections.consumedAt),
        sql`${slackConnections.expiresAt} > ${now}`,
      ),
    )
    .returning({ agentCode: slackConnections.agentCode });
  return rows.length > 0;
}

export type SlackConnectOutcome =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "error"; reason: string }
  | ({ status: "ready" } & { webhookUrl: string; channel: string; teamName: string });

/**
 * Hand the webhook to the agent, exactly once. Same guard as consumePairRequest:
 * the UPDATE is conditioned on `consumed_at IS NULL` and returns what it changed,
 * so concurrent polls cannot both collect the webhook.
 */
export async function consumeSlackConnection(
  db: Db,
  agentCode: string,
  now = new Date(),
): Promise<SlackConnectOutcome> {
  const [pending] = await db
    .select({
      webhookUrl: slackConnections.webhookUrl,
      error: slackConnections.error,
      expiresAt: slackConnections.expiresAt,
      consumedAt: slackConnections.consumedAt,
    })
    .from(slackConnections)
    .where(eq(slackConnections.agentCode, agentCode))
    .limit(1);

  if (!pending || pending.consumedAt !== null) return { status: "expired" };
  if (pending.error !== null) return { status: "error", reason: pending.error };
  if (pending.expiresAt <= now) return { status: "expired" };
  if (pending.webhookUrl === null) return { status: "pending" };

  const claimed = await db
    .update(slackConnections)
    .set({ consumedAt: now })
    .where(and(eq(slackConnections.agentCode, agentCode), isNull(slackConnections.consumedAt)))
    .returning({
      webhookUrl: slackConnections.webhookUrl,
      channel: slackConnections.channel,
      teamName: slackConnections.teamName,
    });

  const row = claimed[0];
  if (!row?.webhookUrl) return { status: "expired" };

  return {
    status: "ready",
    webhookUrl: row.webhookUrl,
    channel: row.channel ?? "your channel",
    teamName: row.teamName ?? "your workspace",
  };
}
