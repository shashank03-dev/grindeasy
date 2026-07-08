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
