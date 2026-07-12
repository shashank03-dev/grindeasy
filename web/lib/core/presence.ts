/**
 * Live "online" resolution, kept pure so it is unit-tested and is the single
 * swap-point behind the "explicit flag vs. heartbeat proxy" decision.
 */

/**
 * How fresh a signal must be to read as online. Two active-sync intervals
 * (~2 min): one lets a sync land, the second absorbs jitter without flapping.
 */
export const ONLINE_WINDOW_MS = 2 * 60_000;

export interface PresenceInput {
  /** Last active-ingest timestamp (v0.3+ agents). The accurate path. */
  lastActiveAt: Date | null;
  /** Newest device heartbeat. The fallback for agents that never send active. */
  lastSeenAt: Date | null;
}

/**
 * Is this user coding right now?
 *
 * Prefer the explicit active flag: once an agent has *ever* reported active
 * work, `lastActiveAt` is authoritative — it only advances while a tool works,
 * so its staleness cleanly means "went idle". Old agents never set it, so they
 * fall back to `lastSeenAt`, which every ingest stamps; that is a coarser ~2 min
 * proxy but never crashes and never shows missing data.
 */
export function isOnline(p: PresenceInput, now = Date.now()): boolean {
  const source = p.lastActiveAt ?? p.lastSeenAt;
  if (!source) return false;
  return now - source.getTime() < ONLINE_WINDOW_MS;
}
