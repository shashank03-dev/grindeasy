import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Stats } from "./types.js";

export function freshStats(now = Date.now()): Stats {
  return {
    activeMsByTool: {},
    combos: 0,
    daily: {},
    firstSeen: new Date(now).toISOString(),
    lastActive: null,
    countedComboBuckets: [],
    lastRecapWeek: "",
    lastWebhookRecapWeek: "",
  };
}

/** Load persisted stats from `dir`/stats.json, or start fresh. */
export function loadStats(dir: string, now = Date.now()): Stats {
  mkdirSync(dir, { recursive: true });
  try {
    const raw = readFileSync(join(dir, "stats.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<Stats>;
    // Merge onto a fresh shape so older/partial files stay valid.
    return { ...freshStats(now), ...parsed };
  } catch {
    return freshStats(now);
  }
}

/** Persist stats atomically (write temp then rename) to avoid torn files. */
export function saveStats(dir: string, stats: Stats): void {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "stats.json");
  const tmp = join(dir, `stats.json.tmp-${process.pid}`);
  writeFileSync(tmp, JSON.stringify(stats, null, 2) + "\n", "utf8");
  renameSync(tmp, target);
}
