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
  /** Optional overrides for tool detection. Empty = use built-in defaults. */
  tools: ToolDef[];
}

export const DEFAULT_CONFIG: Config = {
  discordClientId: "",
  pollIntervalMs: 5_000,
  activeWindowMs: 60_000,
  comboBucketMs: 5 * 60_000,
  statsPort: 4599,
  donateUrl: "https://www.buymeacoffee.com/",
  declaredPlan: "pro",
  showIdlePresence: true,
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
    return { config: { ...DEFAULT_CONFIG, ...parsed }, created: false };
  } catch {
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
    return { config: { ...DEFAULT_CONFIG }, created: true };
  }
}

export function configPath(home = homedir()): string {
  return join(dataDir(home), "config.json");
}
