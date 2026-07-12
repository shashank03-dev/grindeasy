import { homedir } from "node:os";
import * as p from "@clack/prompts";
import { updateConfig, type Config } from "./config.js";
import { coreTools, discoverExtended } from "./catalog.js";
import { detectAll } from "./tools.js";
import { openBrowser, pair } from "./pair.js";
import { installService, isInstalled, platformSupported } from "./service.js";
import * as t from "./theme.js";
import type { ToolDef } from "./types.js";

export interface OnboardingResult {
  /** Account token if pairing completed this run (or the pre-existing one), else "". */
  accountToken: string;
  /** True when a background service now owns tracking — caller should exit. */
  serviceInstalled: boolean;
}

/**
 * Whether the interactive onboarding ceremony has anything to do: a newly-seen
 * catalog tool to offer, or the once-only leaderboard/service questions still
 * unanswered. When false, a normal `grindeasy` run skips straight to the running
 * status — a daily user never sees the banner twice.
 */
export function needsOnboarding(config: Config, home = homedir()): boolean {
  if (!process.stdin.isTTY) return false;
  if (newlyDetected(config, home).length > 0) return true;
  const leaderboardPending =
    Boolean(config.serverUrl) && !config.accountToken && !config.askedToJoinBoard;
  // The service offer follows a pairing (see runOnboarding), so it counts as
  // pending only when a token already exists or we're about to ask for one.
  // Without that guard, a user who declines the board would be asked nothing and
  // yet stay "pending" forever — re-opening the setup ceremony on every run.
  const servicePending =
    (Boolean(config.accountToken) || leaderboardPending) &&
    !config.askedToInstallService &&
    platformSupported(process.platform) &&
    !isInstalled(process.platform, home);
  return leaderboardPending || servicePending;
}

/** Extended tools present on disk that are neither already enabled nor declined. */
function newlyDetected(config: Config, home = homedir()): ToolDef[] {
  return discoverExtended(home).filter(
    (tool) =>
      !config.enabledToolIds.includes(tool.id) && !config.declinedToolIds.includes(tool.id),
  );
}

/**
 * Run the full first-run flow inside one clack sequence: brand banner, tool
 * discovery + consent, leaderboard, background service. Every config mutation is
 * persisted immediately; the caller reloads config afterwards to pick up newly
 * enabled tool ids.
 */
export async function runOnboarding(config: Config): Promise<OnboardingResult> {
  process.stdout.write(t.banner());
  p.intro(t.dim("setup"));

  await offerDetectedTools(config);
  const accountToken = config.accountToken || (await offerLeaderboard(config));
  const serviceInstalled = accountToken ? await offerServiceInstall(config) : false;

  if (!serviceInstalled) p.outro(t.dim("Tracking starts now — Ctrl-C to stop."));
  return { accountToken, serviceInstalled };
}

/**
 * Show what's tracked and what else was found, and (if anything is new) let the
 * user pick which extended tools to start tracking. Accepted ids go to
 * enabledToolIds, the rest to declinedToolIds so they are never re-offered.
 */
async function offerDetectedTools(config: Config): Promise<void> {
  const home = homedir();
  const spin = p.spinner();
  spin.start("Scanning for AI coding tools");

  const enabledExtended = discoverExtended(home).filter((tool) =>
    config.enabledToolIds.includes(tool.id),
  );
  const trackedDefs = [...coreTools(home), ...enabledExtended, ...config.customTools];
  const activities = await detectAll(trackedDefs, config.activeWindowMs);
  const activeNames = new Set(activities.filter((a) => a.active).map((a) => a.name));
  const found = newlyDetected(config, home);

  spin.stop(`${trackedDefs.length} tracked · ${found.length} new`);

  const labelWidth = Math.max(
    ...trackedDefs.map((d) => d.name.length),
    ...found.map((d) => d.name.length),
    4,
  );
  const lines: string[] = [];
  for (const def of trackedDefs) {
    const active = activeNames.has(def.name);
    const mark = active ? t.MARK.active() : t.MARK.tracked();
    lines.push(t.row(mark, t.fg(def.name), labelWidth, active ? "active" : "tracking"));
  }
  for (const def of found) {
    lines.push(t.row(t.MARK.found(), t.dim(def.name), labelWidth, "detected"));
  }
  p.note(lines.join("\n"), "tools");

  if (found.length === 0) return;

  const selected = await p.multiselect<string>({
    message: "Add these to tracking?",
    options: found.map((tool) => ({
      value: tool.id,
      label: tool.name,
      hint: tool.activityDirs[0],
    })),
    initialValues: found.map((tool) => tool.id),
    required: false,
  });
  // Ctrl-C on this step means "decide later": don't record a decline, so it's
  // offered again next run.
  if (p.isCancel(selected)) return;

  const accepted = selected as string[];
  const declined = found.map((tool) => tool.id).filter((id) => !accepted.includes(id));
  const enabledToolIds = [...config.enabledToolIds, ...accepted];
  const declinedToolIds = [...config.declinedToolIds, ...declined];
  updateConfig({ enabledToolIds, declinedToolIds });
  config.enabledToolIds = enabledToolIds;
  config.declinedToolIds = declinedToolIds;

  if (accepted.length > 0) {
    p.log.success(t.phosphor(`Tracking ${accepted.length} more tool${accepted.length > 1 ? "s" : ""}.`));
  }
}

/** Pair with the leaderboard, showing the device code inside the clack flow. */
async function pairWithBoard(serverUrl: string): Promise<string> {
  const token = await pair({
    serverUrl,
    onPrompt: (info) => {
      p.note(`${t.phosphor(info.userCode)}\n${t.dim(info.verifyUrl)}`, "confirm in your browser");
      openBrowser(info.verifyUrl);
    },
  });
  updateConfig({ accountToken: token });
  return token;
}

/**
 * Offer the leaderboard once. Mirrors the previous readline flow's eligibility
 * and never-nag-twice guarantee; only the rendering changed.
 */
async function offerLeaderboard(config: Config): Promise<string> {
  const eligible =
    Boolean(config.serverUrl) && !config.accountToken && !config.askedToJoinBoard;
  if (!eligible) return "";

  updateConfig({ askedToJoinBoard: true });
  config.askedToJoinBoard = true;

  const join = await p.confirm({ message: "Join the global leaderboard?", initialValue: true });
  if (p.isCancel(join) || !join) {
    p.log.info(t.dim("Staying local — run `grindeasy login` any time."));
    return "";
  }

  try {
    const token = await pairWithBoard(config.serverUrl);
    config.accountToken = token;
    p.log.success(t.phosphor("Joined — your rank now shows on your Discord card."));
    return token;
  } catch (err) {
    // A failed pairing must never stop the agent: the card and local tracking
    // work perfectly well without a board.
    p.log.warn(t.dim(`Pairing didn't finish (${(err as Error).message}).`));
    p.log.warn(t.dim("Run `grindeasy login` to try again."));
    return "";
  }
}

/** Offer to install the background service once, after a fresh pairing. */
async function offerServiceInstall(config: Config): Promise<boolean> {
  const eligible =
    !config.askedToInstallService &&
    platformSupported(process.platform) &&
    !isInstalled(process.platform, homedir());
  if (!eligible) return false;

  updateConfig({ askedToInstallService: true });
  config.askedToInstallService = true;

  const keep = await p.confirm({
    message: "Keep grindeasy tracking in the background (survives closing this terminal and reboots)?",
    initialValue: true,
  });
  if (p.isCancel(keep) || !keep) {
    p.log.info(t.dim("Staying in the foreground. Install later with `grindeasy service install`."));
    return false;
  }
  return installService({ statsPort: config.statsPort });
}
