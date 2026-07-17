/** A supported AI coding tool and how to detect that it is being actively used. */
export interface ToolDef {
  /** Stable id, e.g. "claude-code". */
  id: string;
  /** Human label shown on the Discord card, e.g. "Claude Code". */
  name: string;
  /**
   * Directories whose files are written to while the tool is in use.
   * Detection is based purely on the newest file mtime under these roots —
   * never on file contents. This is why the agent never reads your code.
   */
  activityDirs: string[];
  /** File extensions that count as activity signals (e.g. [".jsonl"]). */
  extensions: string[];
  /**
   * Optional path filter. When set, only files whose full path contains one of
   * these fragments (case-insensitive) count as activity — used to isolate one
   * tool inside a directory tree shared by many, e.g. GitHub Copilot's chat under
   * VS Code's `workspaceStorage/<id>/chatSessions/`. Omitted for the common case,
   * where extension matching alone is enough.
   */
  pathIncludes?: string[];
}

/** The subscription/billing plan we surface as a badge. */
export type Plan = "api" | "pro" | "max" | "unknown";

/** Result of a single detection pass over one tool. */
export interface ToolActivity {
  id: string;
  name: string;
  /** True when the newest activity file changed within the active window. */
  active: boolean;
  /** ms since the newest activity file was modified, or null if none found. */
  ageMs: number | null;
}

/** Persisted, cumulative stats. Written to ~/.grindeasy/stats.json. */
export interface Stats {
  /** Cumulative active milliseconds per tool id. */
  activeMsByTool: Record<string, number>;
  /** Number of distinct combo windows (2+ tools active in the same bucket). */
  combos: number;
  /**
   * Per-day rollup keyed by YYYY-MM-DD for streaks, the stats page, and the
   * weekly/monthly views. Never pruned — the full history is what makes
   * week-over-week deltas and personal bests computable with no extra state.
   * `byTool` is per-day active ms per tool id; days written before 0.5.3 omit it
   * and are read as `{}`.
   */
  daily: Record<string, { activeMs: number; combos: number; byTool: Record<string, number> }>;
  /** ISO timestamp of the first time the agent ever ran. */
  firstSeen: string;
  /** ISO timestamp of the most recent tick that recorded activity. */
  lastActive: string | null;
  /** Combo bucket ids already counted, so we never double-count a window. */
  countedComboBuckets: string[];
  /**
   * ISO week key (e.g. "2026-W29") of the most recent week whose recap has been
   * shown in the terminal. Empty until the first recap fires. Guards the auto
   * weekly recap so it prints at most once per week.
   */
  lastRecapWeek: string;
}

/** A computed tier for display. */
export interface TierResult {
  /** Tier name, e.g. "Platinum". */
  name: string;
  /** Unicode glyph shown next to the name, e.g. "◆". */
  glyph: string;
  /** Total XP (hours + combo bonus) used to derive the tier. */
  xp: number;
  /** XP at which the next tier unlocks, or null if maxed. */
  nextAtXp: number | null;
}
