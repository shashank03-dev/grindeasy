import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "./types.js";

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
  /** Leaderboard server base URL, e.g. https://viberank.example. Empty = sync off. */
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
  /** Optional overrides for tool detection. Empty = use built-in defaults. */
  tools: ToolDef[];
}

/**
 * viberank's own Discord application. Rich Presence client IDs are public
 * identifiers, not secrets, and shipping ours means a new user gets a working
 * card with zero setup — no Developer Portal, no art assets to upload.
 *
 * TO FILL IN (one-time, maintainer only): create the application at
 * https://discord.com/developers/applications, name it "viberank" (this is the
 * name Discord shows on every user's profile), upload the PNGs from
 * assets/discord/ under Rich Presence → Art Assets with the exact keys
 * "viberank", "api", "pro", "max", then paste the Application ID here. Until
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
export const OFFICIAL_DISCORD_APP_ID = "";

/**
 * The hosted leaderboard. Empty until the board has a home: the agent must
 * never default to syncing anyone's stats to a domain we don't control.
 *
 * With this empty, `offerLeaderboard` never fires and SyncClient stays off, so
 * the card and local tracking work exactly as they do with it set. Fill it in
 * once the domain is registered and the server is deployed — no other change.
 */
export const OFFICIAL_SERVER_URL = "";

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
  // user completes `viberank login` in a browser.
  serverUrl: OFFICIAL_SERVER_URL,
  accountToken: "",
  syncIntervalMs: 5 * 60_000,
  activeSyncIntervalMs: MIN_SYNC_INTERVAL_MS,
  askedToJoinBoard: false,
  tools: [],
};

/** Base directory for all viberank runtime data. */
export function dataDir(home = homedir()): string {
  return join(home, ".viberank");
}

/**
 * Load config from ~/.viberank/config.json, creating a default file on first
 * run. Returns the config plus whether it was just created (so the caller can
 * print setup instructions).
 */
export function loadConfig(home = homedir()): { config: Config; created: boolean } {
  const dir = dataDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { config: normalize({ ...DEFAULT_CONFIG, ...parsed }), created: false };
  } catch {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
    return { config: { ...DEFAULT_CONFIG }, created: true };
  }
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
 * and any we don't know about. This is how `viberank login` stores the token it
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
