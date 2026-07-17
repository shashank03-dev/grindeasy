import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "./types.js";

/** What the data directory was called under this project's previous names, oldest first. */
const LEGACY_DIRS = [".viberank", ".grindboard"];

export interface Config {
  /** Discord Application (client) ID from the Developer Portal. Required for the card. */
  discordClientId: string;
  /** How often to poll for activity, in ms. */
  pollIntervalMs: number;
  /** A tool counts as active if its newest file changed within this window, in ms. */
  activeWindowMs: number;
  /** Combo detection window, in ms. */
  comboBucketMs: number;
  /** Port for the local stats web page. */
  statsPort: number;
  /** Where the "support this project" button points. */
  donateUrl: string;
  /** Subscription users declare Pro or Max here (trusted as-is). */
  declaredPlan: "pro" | "max";
  /** Keep the Discord card up (showing tier) even when no tool is active. */
  showIdlePresence: boolean;
  /** Leaderboard server base URL, e.g. https://grindeasy.example. Empty = sync off. */
  serverUrl: string;
  /** Agent token from your /me page on the leaderboard server. Empty = sync off. */
  accountToken: string;
  /** How often to push totals to the leaderboard server while idle, in ms. */
  syncIntervalMs: number;
  /** How often to push while a tool is active, in ms. Never below MIN_SYNC_INTERVAL_MS. */
  activeSyncIntervalMs: number;
  /**
   * Whether we've already offered to join the leaderboard. Set once, so a user
   * who says no is never asked again.
   */
  askedToJoinBoard: boolean;
  /**
   * Whether we've already offered to install the background service. Set once,
   * same never-nag-twice rule as askedToJoinBoard.
   */
  askedToInstallService: boolean;
  /**
   * Legacy tool overrides. Retained only for one-time migration into
   * `customTools` (see migrateCustomTools); new installs never set it.
   */
  tools: ToolDef[];
  /** Extended-catalog tool ids the user opted into tracking. */
  enabledToolIds: string[];
  /** Extended-catalog tool ids the user declined — never re-offered. */
  declinedToolIds: string[];
  /** User-added custom tools; always tracked. */
  customTools: ToolDef[];
  /**
   * Weekly active-hours goal. When > 0, the weekly card and dashboard show a
   * progress ring toward it. 0 (the default) hides the goal UI entirely.
   * Config-only — set it by hand in config.json; onboarding never asks.
   */
  weeklyGoalHours: number;
}

/**
 * grindeasy's own Discord application. Rich Presence client IDs are public
 * identifiers, not secrets, and shipping ours means a new user gets a working
 * card with zero setup — no Developer Portal, no art assets to upload.
 *
 * TO FILL IN (one-time, maintainer only): create the application at
 * https://discord.com/developers/applications, name it "grindeasy" (this is the
 * name Discord shows on every user's profile), upload the PNGs from
 * assets/discord/ under Rich Presence → Art Assets with the exact keys
 * "grindeasy", "api", "pro", "max", then paste the Application ID here. Until
 * this is set, everything still works — tracking, leaderboard, rank — but the
 * Discord card stays off and printSetupHelp() tells the user why.
 *
 * UNVERIFIED: Discord's terms have not been confirmed to permit one application
 * serving Rich Presence for every user of a distributed tool. Precedent exists
 * (opencode-discord-presence ships a shared app id), but precedent is not
 * permission. This is the single constant to change if it turns out to be
 * disallowed; setting it back to "" restores the per-user flow with no other
 * code changes.
 */
export const OFFICIAL_DISCORD_APP_ID = "1525448643426123826";

/**
 * The hosted leaderboard. Live, so first run can offer to join it.
 *
 * grindeasy.tech, not the raw Vercel URL — the domain we actually own, so
 * changing hosts later never breaks an already-installed agent.
 */
export const OFFICIAL_SERVER_URL = "https://grindeasy.tech";

/**
 * The server refuses more than one ingest per token per minute (its
 * MIN_INGEST_GAP_MS). Syncing faster than this just earns 429s, so the active
 * interval is clamped to it.
 */
export const MIN_SYNC_INTERVAL_MS = 60_000;

export const DEFAULT_CONFIG: Config = {
  discordClientId: OFFICIAL_DISCORD_APP_ID,
  pollIntervalMs: 5_000,
  activeWindowMs: 60_000,
  comboBucketMs: 5 * 60_000,
  statsPort: 4599,
  donateUrl: "https://www.buymeacoffee.com/",
  declaredPlan: "pro",
  showIdlePresence: true,
  // Even once this is set, it does not make the agent phone home: SyncClient
  // stays disabled until accountToken is set, and that only happens after the
  // user completes `grindeasy login` in a browser.
  serverUrl: OFFICIAL_SERVER_URL,
  accountToken: "",
  syncIntervalMs: 5 * 60_000,
  activeSyncIntervalMs: MIN_SYNC_INTERVAL_MS,
  askedToJoinBoard: false,
  askedToInstallService: false,
  tools: [],
  enabledToolIds: [],
  declinedToolIds: [],
  customTools: [],
  weeklyGoalHours: 0,
};

/** Base directory for all grindeasy runtime data. */
export function dataDir(home = homedir()): string {
  return join(home, ".grindeasy");
}

/**
 * Carry a pre-rename install across to the new directory. Someone's tier and
 * hours are the whole point of the tool; a rename must not silently reset them
 * to Bronze. Moves the directory rather than copying, so it runs exactly once
 * and there is no stale second copy to drift.
 *
 * Checks newest legacy name first, since that's the one most likely to exist.
 * Never overwrites: if the new directory already exists, every legacy one is
 * left alone and ignored.
 */
export function migrateLegacyDir(home = homedir()): void {
  const current = dataDir(home);
  if (existsSync(current)) return;
  for (const legacyName of [...LEGACY_DIRS].reverse()) {
    const legacy = join(home, legacyName);
    if (!existsSync(legacy)) continue;
    try {
      renameSync(legacy, current);
      console.log(`[grindeasy] moved your stats from ~/${legacyName} to ~/.grindeasy`);
    } catch {
      // A cross-device rename (or a permissions problem) is not worth crashing
      // over: the user simply starts fresh, which is the pre-migration behaviour.
    }
    return;
  }
}

/**
 * Load config from ~/.grindeasy/config.json, creating a default file on first
 * run. Returns the config plus whether it was just created (so the caller can
 * print setup instructions).
 */
export function loadConfig(home = homedir()): { config: Config; created: boolean } {
  // Must run before mkdirSync: creating the new directory first would make the
  // migration think it had already happened.
  migrateLegacyDir(home);
  const dir = dataDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    const { config, changed } = migrateCustomTools(normalize({ ...DEFAULT_CONFIG, ...parsed }));
    // Persist the migration once so the legacy `tools` field is emptied on disk
    // and never migrated twice.
    if (changed) writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
    return { config, created: false };
  } catch {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
    return { config: { ...DEFAULT_CONFIG }, created: true };
  }
}

/**
 * One-time migration of the legacy `tools` override into `customTools`. A user
 * who hand-set `tools` under an older version keeps tracking exactly those tools;
 * the field is then cleared so this runs at most once. Idempotent: an empty
 * `tools` (every current install) is left untouched.
 */
export function migrateCustomTools(config: Config): { config: Config; changed: boolean } {
  if (config.tools.length === 0) return { config, changed: false };
  if (config.customTools.length > 0) {
    // customTools already populated — don't clobber it, just drop the legacy field.
    return { config: { ...config, tools: [] }, changed: true };
  }
  return { config: { ...config, customTools: config.tools, tools: [] }, changed: true };
}

/** Keep hand-edited values inside the bounds the server will actually accept. */
function normalize(config: Config): Config {
  return {
    ...config,
    activeSyncIntervalMs: Math.max(MIN_SYNC_INTERVAL_MS, config.activeSyncIntervalMs),
    syncIntervalMs: Math.max(MIN_SYNC_INTERVAL_MS, config.syncIntervalMs),
  };
}

export function configPath(home = homedir()): string {
  return join(dataDir(home), "config.json");
}

/**
 * Merge changes into the on-disk config, preserving keys the user set by hand
 * and any we don't know about. This is how `grindeasy login` stores the token it
 * receives from pairing, so nobody ever edits this file themselves.
 */
export function updateConfig(patch: Partial<Config>, home = homedir()): Config {
  const dir = dataDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");

  let existing: Partial<Config> = {};
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
  } catch {
    // No readable config yet; the patch lands on top of the defaults.
  }

  const merged = { ...DEFAULT_CONFIG, ...existing, ...patch };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}
