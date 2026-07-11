import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Plan } from "../../src/types.js";
import type { IngestBaseline } from "./ingest.js";
import type { BoardRow } from "./leaderboard.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  plan TEXT NOT NULL DEFAULT 'unknown',
  combos INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_totals (
  user_id INTEGER NOT NULL,
  tool_id TEXT NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, tool_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  baseline_json TEXT
);
CREATE TABLE IF NOT EXISTS device_codes (
  device_code TEXT PRIMARY KEY,
  user_code TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  -- Null until a signed-in human approves this code in a browser.
  user_id INTEGER,
  -- Set once the agent has collected its token, so a code is never reused.
  consumed INTEGER NOT NULL DEFAULT 0
);
`;

export interface UserRecord {
  id: number;
  discordId: string;
  username: string;
  avatar: string | null;
  plan: Plan;
  combos: number;
}

export interface AgentTokenRecord {
  userId: number;
  baseline: IngestBaseline | null;
}

/**
 * The outcome of an agent polling for its token. Mirrors the wire protocol
 * exactly, so the router can't accidentally report "ready" twice for one code.
 */
export type ClaimResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "ready"; userId: number };

/** A pairing request, from the moment the agent asks until the agent collects. */
export interface DeviceCodeRecord {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  /** Null until approved in a browser. */
  userId: number | null;
  consumed: boolean;
}

/**
 * Human-typable code: no vowels (so it can't spell anything) and no 0/O/1/I
 * (so it can't be misread off a terminal). Formatted ABCD-EFGH.
 */
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

function newUserCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

interface UserRow {
  id: number;
  discord_id: string;
  username: string;
  avatar: string | null;
  plan: string;
  combos: number;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: Number(row.id),
    discordId: row.discord_id,
    username: row.username,
    avatar: row.avatar,
    plan: row.plan as Plan,
    combos: Number(row.combos),
  };
}

interface DeviceCodeRow {
  device_code: string;
  user_code: string;
  expires_at: number;
  user_id: number | null;
  consumed: number;
}

function toDeviceCode(row: DeviceCodeRow): DeviceCodeRecord {
  return {
    deviceCode: row.device_code,
    userCode: row.user_code,
    expiresAt: Number(row.expires_at),
    userId: row.user_id === null ? null : Number(row.user_id),
    consumed: Number(row.consumed) === 1,
  };
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * All persistence behind one class. Backed by node:sqlite (built into Node),
 * so the server has zero runtime dependencies. Pass ":memory:" for tests.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  upsertUser(discordId: string, username: string, avatar: string | null): UserRecord {
    this.db
      .prepare(
        `INSERT INTO users (discord_id, username, avatar, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar`,
      )
      .run(discordId, username, avatar, Date.now());
    const row = this.db
      .prepare(`SELECT * FROM users WHERE discord_id = ?`)
      .get(discordId) as unknown as UserRow;
    return toUser(row);
  }

  getUserById(id: number): UserRecord | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
      | unknown
      | undefined;
    return row ? toUser(row as UserRow) : null;
  }

  setPlan(userId: number, plan: Plan): void {
    this.db.prepare(`UPDATE users SET plan = ? WHERE id = ?`).run(plan, userId);
  }

  addCombos(userId: number, n: number): void {
    if (n <= 0) return;
    this.db.prepare(`UPDATE users SET combos = combos + ? WHERE id = ?`).run(n, userId);
  }

  creditTool(userId: number, toolId: string, ms: number): void {
    if (ms <= 0) return;
    this.db
      .prepare(
        `INSERT INTO tool_totals (user_id, tool_id, active_ms) VALUES (?, ?, ?)
         ON CONFLICT(user_id, tool_id) DO UPDATE SET active_ms = active_ms + excluded.active_ms`,
      )
      .run(userId, toolId, ms);
  }

  userToolTotals(userId: number): Record<string, number> {
    const rows = this.db
      .prepare(`SELECT tool_id, active_ms FROM tool_totals WHERE user_id = ?`)
      .all(userId) as unknown as Array<{ tool_id: string; active_ms: number }>;
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.tool_id] = Number(r.active_ms);
    return totals;
  }

  createSession(userId: number): string {
    const token = newToken();
    this.db
      .prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`)
      .run(token, userId, Date.now());
    return token;
  }

  getSessionUser(token: string): UserRecord | null {
    const row = this.db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      )
      .get(token) as unknown | undefined;
    return row ? toUser(row as UserRow) : null;
  }

  deleteSession(token: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  }

  /** One stable agent token per user — shown on /me, pasted into the agent config. */
  getOrCreateAgentToken(userId: number): string {
    const row = this.db
      .prepare(`SELECT token FROM agent_tokens WHERE user_id = ?`)
      .get(userId) as unknown as { token: string } | undefined;
    if (row) return row.token;
    const token = newToken();
    this.db
      .prepare(`INSERT INTO agent_tokens (token, user_id, created_at) VALUES (?, ?, ?)`)
      .run(token, userId, Date.now());
    return token;
  }

  getAgentToken(token: string): AgentTokenRecord | null {
    const row = this.db
      .prepare(`SELECT user_id, baseline_json FROM agent_tokens WHERE token = ?`)
      .get(token) as unknown as { user_id: number; baseline_json: string | null } | undefined;
    if (!row) return null;
    let baseline: IngestBaseline | null = null;
    if (row.baseline_json) {
      try {
        baseline = JSON.parse(row.baseline_json) as IngestBaseline;
      } catch {
        baseline = null;
      }
    }
    return { userId: Number(row.user_id), baseline };
  }

  saveBaseline(token: string, baseline: IngestBaseline): void {
    this.db
      .prepare(`UPDATE agent_tokens SET baseline_json = ? WHERE token = ?`)
      .run(JSON.stringify(baseline), token);
  }

  /** Begin a pairing. The agent holds the device code; the human types the user code. */
  createDeviceCode(now: number, ttlMs: number): DeviceCodeRecord {
    const record: DeviceCodeRecord = {
      deviceCode: newToken(),
      userCode: newUserCode(),
      expiresAt: now + ttlMs,
      userId: null,
      consumed: false,
    };
    this.db
      .prepare(
        `INSERT INTO device_codes (device_code, user_code, expires_at) VALUES (?, ?, ?)`,
      )
      .run(record.deviceCode, record.userCode, record.expiresAt);
    return record;
  }

  getDeviceCodeByUserCode(userCode: string, now: number): DeviceCodeRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM device_codes WHERE user_code = ? AND expires_at > ?`)
      .get(userCode.toUpperCase(), now) as unknown as DeviceCodeRow | undefined;
    return row ? toDeviceCode(row) : null;
  }

  /** A signed-in human vouches for the waiting agent. */
  approveDeviceCode(userCode: string, userId: number, now: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE device_codes SET user_id = ?
         WHERE user_code = ? AND expires_at > ? AND consumed = 0`,
      )
      .run(userId, userCode.toUpperCase(), now);
    return Number(result.changes) > 0;
  }

  /**
   * The agent collecting its token. Consumes the code on success, so a leaked
   * device code can't be replayed — a second claim reports "expired", exactly
   * as an unknown or timed-out code does.
   */
  claimDeviceCode(deviceCode: string, now: number): ClaimResult {
    const row = this.db
      .prepare(`SELECT * FROM device_codes WHERE device_code = ?`)
      .get(deviceCode) as unknown as DeviceCodeRow | undefined;
    if (!row) return { status: "expired" };

    const record = toDeviceCode(row);
    if (record.consumed || record.expiresAt <= now) return { status: "expired" };
    if (record.userId === null) return { status: "pending" };

    this.db.prepare(`UPDATE device_codes SET consumed = 1 WHERE device_code = ?`).run(deviceCode);
    return { status: "ready", userId: record.userId };
  }

  /** Housekeeping: expired codes are worthless, so don't keep them around. */
  purgeExpiredDeviceCodes(now: number): void {
    this.db.prepare(`DELETE FROM device_codes WHERE expires_at <= ?`).run(now);
  }

  boardRows(): BoardRow[] {
    const rows = this.db
      .prepare(
        `SELECT u.discord_id, u.username, u.avatar, u.plan, u.combos,
                COALESCE(SUM(t.active_ms), 0) AS active_ms
         FROM users u LEFT JOIN tool_totals t ON t.user_id = u.id
         GROUP BY u.id`,
      )
      .all() as unknown as Array<{
      discord_id: string;
      username: string;
      avatar: string | null;
      plan: string;
      combos: number;
      active_ms: number;
    }>;
    return rows.map((r) => ({
      discordId: r.discord_id,
      username: r.username,
      avatar: r.avatar,
      plan: r.plan as Plan,
      activeMs: Number(r.active_ms),
      combos: Number(r.combos),
    }));
  }

  close(): void {
    this.db.close();
  }
}
