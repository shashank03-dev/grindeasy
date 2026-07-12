import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
// Relative, not "@/..." — drizzle-kit loads this file outside the Next.js
// bundler and cannot resolve the tsconfig path alias.
import type { IngestBaseline } from "../core/ingest";
import type { Plan } from "../core/types";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  discordId: text("discord_id").notNull().unique(),
  username: text().notNull(),
  /** Discord avatar hash, not a URL. */
  avatar: text(),
  plan: text().$type<Plan>().notNull().default("unknown"),
  combos: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Last time any device reported a tool *actively working*. Its freshness is
   * the live "online" signal on the personal card; stamped only on active
   * ingests, so it goes stale (offline) as soon as the user stops coding.
   */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /** Tool ids reported working on the most recent active ingest. */
  activeNow: jsonb("active_now").$type<string[]>(),
});

export const toolTotals = pgTable(
  "tool_totals",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    // Milliseconds, cumulative. int4 tops out at ~24.8 days of active time,
    // which a real user will reach; int8 does not.
    activeMs: bigint("active_ms", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.toolId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/**
 * One row per paired *device*, not per user. Each device carries its own ingest
 * baseline: two machines sharing one baseline ratchet against each other and
 * credit elapsed wall-clock time for no work. See the design doc.
 */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    token: text().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Human label so users can tell devices apart when revoking. */
    label: text().notNull().default("unnamed device"),
    baseline: jsonb().$type<IngestBaseline>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [index("agent_tokens_user_id_idx").on(t.userId)],
);

/**
 * Device-authorization pairing. The agent holds `deviceCode` (secret) and polls
 * with it; the human types/sees `userCode` in the browser. A row is claimed by
 * setting `userId`, then consumed exactly once when the agent collects its token.
 */
export const pairRequests = pgTable(
  "pair_requests",
  {
    deviceCode: text("device_code").primaryKey(),
    userCode: text("user_code").notNull().unique(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("pair_requests_user_code_idx").on(t.userCode)],
);
