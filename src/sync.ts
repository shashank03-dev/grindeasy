import type { Plan, Stats } from "./types.js";

export const AGENT_VERSION = "0.3.0";

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
  /**
   * Whether a tool is working right now. Drives the leaderboard's live "online"
   * dot. Privacy-safe: a single boolean, no code or content.
   */
  active: boolean;
  /**
   * Tool ids working right now — a subset of `toolTotalsMs`'s keys, which are
   * already non-secret. Never file paths, prompts, or anything identifying.
   */
  activeNow: string[];
}

export type SyncStatus = "disabled" | "pending" | "ok" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Board position as of the last successful sync, or null if unknown. */
  rank: number | null;
  /** Size of the field the rank is out of, or null if unknown. */
  totalPlayers: number | null;
  /**
   * Tier as the server scored it at the last successful sync, or null when
   * unknown (never synced, board down, or an older server). The card prefers
   * this over its local estimate so its badge matches the leaderboard.
   */
  tier: { name: string; glyph: string } | null;
}

/** The bits of the ingest response the agent actually uses. */
interface IngestResponse {
  rank?: number | null;
  totalPlayers?: number | null;
  tier?: { name?: unknown; glyph?: unknown } | null;
}

export interface SyncOptions {
  serverUrl: string;
  accountToken: string;
  /** Interval used while no tool is active. */
  syncIntervalMs: number;
  /**
   * Interval used while a tool is working, so the board moves while you code.
   * Must not go below the server's MIN_INGEST_GAP_MS or every push is refused.
   */
  activeSyncIntervalMs: number;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

export function buildPayload(
  stats: Stats,
  plan: Plan,
  active = false,
  activeNow: string[] = [],
): SyncPayload {
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
    active,
    activeNow,
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
  /** Set when the server rate-limits us; no request goes out before this. */
  private retryNotBeforeMs = 0;
  readonly state: SyncState;

  constructor(opts: SyncOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.state = {
      status: this.enabled ? "pending" : "disabled",
      lastSyncAt: null,
      lastError: null,
      rank: null,
      totalPlayers: null,
      tier: null,
    };
  }

  get enabled(): boolean {
    return Boolean(this.opts.serverUrl && this.opts.accountToken);
  }

  /**
   * Called every tick; only actually syncs once per interval. While a tool is
   * active that interval is short, so the board (and the rank on the card)
   * moves while you work; idle, it backs off.
   */
  async maybeSync(
    stats: Stats,
    plan: Plan,
    now = Date.now(),
    active = false,
    activeNow: string[] = [],
  ): Promise<void> {
    if (!this.enabled || this.inFlight) return;
    if (now < this.retryNotBeforeMs) return;
    const interval = active ? this.opts.activeSyncIntervalMs : this.opts.syncIntervalMs;
    if (now - this.lastAttemptMs < interval) return;

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
        body: JSON.stringify(buildPayload(stats, plan, active, activeNow)),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as IngestResponse;
        this.state.status = "ok";
        this.state.lastSyncAt = new Date(now).toISOString();
        this.state.lastError = null;
        this.state.rank = typeof body.rank === "number" ? body.rank : null;
        this.state.totalPlayers =
          typeof body.totalPlayers === "number" ? body.totalPlayers : null;
        const t = body.tier;
        this.state.tier =
          t && typeof t.name === "string" && typeof t.glyph === "string"
            ? { name: t.name, glyph: t.glyph }
            : null;
      } else {
        if (res.status === 429) this.retryNotBeforeMs = now + (await retryAfterMs(res));
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

/** How long the server told us to wait, defaulting to one minute. */
async function retryAfterMs(res: Response): Promise<number> {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  try {
    const body = (await res.json()) as { retryAfterS?: unknown };
    if (typeof body.retryAfterS === "number" && body.retryAfterS > 0) {
      return body.retryAfterS * 1000;
    }
  } catch {
    // No usable body; fall through to the default.
  }
  return 60_000;
}
