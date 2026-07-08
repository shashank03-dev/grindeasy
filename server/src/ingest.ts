import type { Plan } from "../../src/types.js";

/** Minimum wall-clock gap between two ingests from the same agent token. */
export const MIN_INGEST_GAP_MS = 60_000;
/**
 * Cap on how much wall-clock time a single ingest can credit. If an agent was
 * offline for a day it can't claim a day of activity in one shot — legit users
 * sync every few minutes, so this only bites cheaters and long outages.
 */
export const MAX_ELAPSED_CREDIT_MS = 6 * 3_600_000;
/** Must match the agent's default combo window. */
export const COMBO_BUCKET_MS = 5 * 60_000;
/** Sanity bounds for reported tool ids. */
const TOOL_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_TOOLS = 32;

export const PLANS: readonly Plan[] = ["api", "pro", "max", "unknown"];

/** What the agent POSTs to /api/ingest: cumulative totals, never deltas. */
export interface IngestPayload {
  version: 1;
  plan: Plan;
  /** Cumulative active ms per tool id, as tracked by the local agent. */
  toolTotalsMs: Record<string, number>;
  /** Cumulative combo windows. */
  totalCombos: number;
  agentVersion: string;
}

/** Last accepted totals for one agent token; the reference point for deltas. */
export interface IngestBaseline {
  lastIngestMs: number;
  toolTotalsMs: Record<string, number>;
  totalCombos: number;
}

export type IngestResult =
  | { ok: false; retryAfterS: number }
  | {
      ok: true;
      creditedMsByTool: Record<string, number>;
      creditedCombos: number;
      newBaseline: IngestBaseline;
    };

/** Parse an unknown JSON body into a payload, or null if it's not one. */
export function parsePayload(body: unknown): IngestPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.version !== 1) return null;
  if (!PLANS.includes(b.plan as Plan)) return null;
  if (typeof b.toolTotalsMs !== "object" || b.toolTotalsMs === null) return null;
  const totals: Record<string, number> = {};
  for (const [id, ms] of Object.entries(b.toolTotalsMs as Record<string, unknown>)) {
    if (!TOOL_ID_RE.test(id)) continue;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) continue;
    totals[id] = Math.floor(ms);
    if (Object.keys(totals).length >= MAX_TOOLS) break;
  }
  const combos =
    typeof b.totalCombos === "number" && Number.isFinite(b.totalCombos) && b.totalCombos > 0
      ? Math.floor(b.totalCombos)
      : 0;
  return {
    version: 1,
    plan: b.plan as Plan,
    toolTotalsMs: totals,
    totalCombos: combos,
    agentVersion: typeof b.agentVersion === "string" ? b.agentVersion.slice(0, 32) : "",
  };
}

/**
 * Fold one ingest into a token's baseline, returning the *credited* (clamped)
 * deltas to add to the user's aggregate. Anti-cheat rules:
 *
 * - Rate limited to one ingest per MIN_INGEST_GAP_MS.
 * - The first ingest of a token only sets the baseline (credits nothing).
 * - Per-tool credit ≤ wall-clock elapsed since the last ingest, and elapsed is
 *   itself capped at MAX_ELAPSED_CREDIT_MS.
 * - Combo credit ≤ the number of combo windows that could have elapsed.
 * - Totals that *decreased* (agent stats reset) re-baseline with zero credit.
 */
export function applyIngest(
  baseline: IngestBaseline | null,
  payload: IngestPayload,
  nowMs: number,
): IngestResult {
  if (baseline !== null) {
    const sinceMs = nowMs - baseline.lastIngestMs;
    if (sinceMs < MIN_INGEST_GAP_MS) {
      return { ok: false, retryAfterS: Math.ceil((MIN_INGEST_GAP_MS - sinceMs) / 1000) };
    }
  }

  const newBaseline: IngestBaseline = {
    lastIngestMs: nowMs,
    toolTotalsMs: payload.toolTotalsMs,
    totalCombos: payload.totalCombos,
  };

  if (baseline === null) {
    return { ok: true, creditedMsByTool: {}, creditedCombos: 0, newBaseline };
  }

  const elapsedMs = Math.min(Math.max(0, nowMs - baseline.lastIngestMs), MAX_ELAPSED_CREDIT_MS);

  const creditedMsByTool: Record<string, number> = {};
  for (const [id, total] of Object.entries(payload.toolTotalsMs)) {
    const prev = baseline.toolTotalsMs[id] ?? 0;
    const delta = Math.min(Math.max(0, total - prev), elapsedMs);
    if (delta > 0) creditedMsByTool[id] = delta;
  }

  const comboDelta = Math.max(0, payload.totalCombos - baseline.totalCombos);
  const creditedCombos = Math.min(comboDelta, Math.ceil(elapsedMs / COMBO_BUCKET_MS));

  return { ok: true, creditedMsByTool, creditedCombos, newBaseline };
}
