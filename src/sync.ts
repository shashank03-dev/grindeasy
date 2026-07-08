import type { Plan, Stats } from "./types.js";

export const AGENT_VERSION = "0.2.0";

/**
 * What we send to the leaderboard server: cumulative aggregates only. The
 * server computes clamped deltas from these totals. This is the ENTIRE
 * payload — no code, no prompts, no paths, no keys, ever.
 */
export interface SyncPayload {
  version: 1;
  plan: Plan;
  toolTotalsMs: Record<string, number>;
  totalCombos: number;
  agentVersion: string;
}

export type SyncStatus = "disabled" | "pending" | "ok" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface SyncOptions {
  serverUrl: string;
  accountToken: string;
  syncIntervalMs: number;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

export function buildPayload(stats: Stats, plan: Plan): SyncPayload {
  const toolTotalsMs: Record<string, number> = {};
  for (const [id, ms] of Object.entries(stats.activeMsByTool)) {
    toolTotalsMs[id] = Math.floor(ms);
  }
  return {
    version: 1,
    plan,
    toolTotalsMs,
    totalCombos: stats.combos,
    agentVersion: AGENT_VERSION,
  };
}

/**
 * Pushes aggregate totals to the leaderboard server. Completely optional —
 * disabled unless both serverUrl and accountToken are configured — and never
 * throws: a dead server just means the leaderboard lags, local tracking and
 * the Discord card keep working.
 */
export class SyncClient {
  private readonly opts: SyncOptions;
  private readonly fetchFn: typeof fetch;
  private lastAttemptMs = 0;
  private inFlight = false;
  readonly state: SyncState;

  constructor(opts: SyncOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.state = {
      status: this.enabled ? "pending" : "disabled",
      lastSyncAt: null,
      lastError: null,
    };
  }

  get enabled(): boolean {
    return Boolean(this.opts.serverUrl && this.opts.accountToken);
  }

  /** Called every tick; only actually syncs once per syncIntervalMs. */
  async maybeSync(stats: Stats, plan: Plan, now = Date.now()): Promise<void> {
    if (!this.enabled || this.inFlight) return;
    if (now - this.lastAttemptMs < this.opts.syncIntervalMs) return;
    this.lastAttemptMs = now;
    this.inFlight = true;
    try {
      const url = `${this.opts.serverUrl.replace(/\/+$/, "")}/api/ingest`;
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.accountToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildPayload(stats, plan)),
      });
      if (res.ok) {
        this.state.status = "ok";
        this.state.lastSyncAt = new Date(now).toISOString();
        this.state.lastError = null;
      } else {
        this.state.status = "error";
        this.state.lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      this.state.status = "error";
      this.state.lastError = (err as Error).message;
    } finally {
      this.inFlight = false;
    }
  }
}
