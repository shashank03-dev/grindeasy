#!/usr/bin/env node
import { loadConfig, dataDir, configPath, updateConfig } from "./config.js";
import { openBrowser, pair } from "./pair.js";
import { detectPlan, planBadge } from "./plan.js";
import { PresenceManager, REPO_URL } from "./presence.js";
import {
  installService,
  isAgentRunning,
  renderRunningStatus,
  serviceStatus,
  uninstallService,
} from "./service.js";
import { buildSnapshot, type Snapshot } from "./snapshot.js";
import { startStatsServer } from "./statsServer.js";
import { loadStats, saveStats } from "./store.js";
import { SyncClient } from "./sync.js";
import { computeTier } from "./tiers.js";
import { trackedTools } from "./catalog.js";
import { detectAll } from "./tools.js";
import { needsOnboarding, runOnboarding } from "./onboarding.js";
import { runToolsCommand } from "./toolsCli.js";
import * as theme from "./theme.js";
import { Tracker } from "./tracker.js";
import type { Plan, TierResult } from "./types.js";

/**
 * How long a session survives a lull in tool activity. Tool logs are bursty —
 * a single long model turn writes nothing for minutes — so a gap shorter than
 * this is still the same session. Without it the elapsed timer on the Discord
 * card restarts at 0:00 every time the model thinks for longer than
 * `activeWindowMs`, which is most turns.
 *
 * This only affects what the card *displays*. Credited time still comes from
 * the raw per-tick detection, so a lull is never counted as work.
 */
const SESSION_GRACE_MS = 5 * 60_000;

/**
 * Only reachable when OFFICIAL_DISCORD_APP_ID is unset (self-hosters, or if
 * Discord ever disallows a shared application). The happy path shows nothing.
 */
function printSetupHelp(): void {
  console.log(`
┌─ grindeasy setup ────────────────────────────────────────────┐
  No Discord Application ID is configured, so the card is off.
  Tracking and the leaderboard still work without it.

  To enable the card, create a free application at
    https://discord.com/developers/applications
  upload a Rich Presence art asset named "grindeasy", then set
    "discordClientId" in ${configPath()}
└─────────────────────────────────────────────────────────────┘
`);
}

/**
 * Pair this machine with the leaderboard. The user clicks one button in a
 * browser; the agent writes its own token. No file editing.
 */
async function pairWithBoard(serverUrl: string): Promise<string> {
  const token = await pair({
    serverUrl,
    onPrompt: (info) => {
      console.log(`\n  Confirm this code in your browser:  ${info.userCode}\n`);
      console.log(`  ${info.verifyUrl}\n`);
      console.log(`  Waiting for you to authorize…`);
      openBrowser(info.verifyUrl);
    },
  });
  updateConfig({ accountToken: token });
  return token;
}

/** `grindeasy login` — pair explicitly, e.g. to re-pair after revoking a device. */
async function login(): Promise<void> {
  const { config } = loadConfig();
  if (!config.serverUrl) {
    console.error("No serverUrl configured, so there is nothing to pair with.");
    process.exit(1);
  }
  await pairWithBoard(config.serverUrl);
  console.log(`\n  ✓ Paired. Run \`grindeasy\` and your time starts counting.\n`);
}

/** The duplicate guard's output: a live snapshot instead of a second tracker. */
function printAlreadyRunning(snap: Snapshot): void {
  console.log(theme.dim("grindeasy is already running in the background.\n"));
  console.log(renderRunningStatus(snap));
  console.log(theme.dim("\nManage it:  grindeasy service status\n"));
}

/**
 * The persistent status block shown once the tracker starts. A boxed, phosphor
 * panel replacing the old plain lines; colour degrades to plain text without a
 * TTY (so the service log stays readable). The banner is left to onboarding so a
 * daily foreground run isn't front-loaded with art.
 */
function printStartup(opts: {
  tier: TierResult;
  plan: Plan;
  statsPort: number;
  toolNames: string[];
  syncEnabled: boolean;
  serverUrl: string;
}): void {
  const label = (s: string) => theme.dim(s.padEnd(11));
  const sync = opts.syncEnabled
    ? theme.phosphor(`→ ${opts.serverUrl}`)
    : theme.dim("off — run `grindeasy login` to join the board");
  const lines = [
    `${label("tier")}${theme.fg(`${opts.tier.glyph} ${opts.tier.name}`)}  ${theme.dimmer(
      `· plan ${planBadge(opts.plan)}`,
    )}`,
    `${label("dashboard")}${theme.fg(`http://localhost:${opts.statsPort}`)}`,
    `${label("tools")}${theme.fg(opts.toolNames.join(", "))}`,
    `${label("sync")}${sync}`,
    `${label("repo")}${theme.dimmer(REPO_URL)}`,
  ];
  console.log("\n" + theme.panel("grindeasy running", lines));
}

async function main(): Promise<void> {
  if (process.argv[2] === "login") {
    await login();
    return;
  }

  if (process.argv[2] === "service") {
    const { config } = loadConfig();
    const env = { statsPort: config.statsPort };
    const verb = process.argv[3];
    if (verb === "install") await installService(env);
    else if (verb === "uninstall") await uninstallService(env);
    else if (verb === "status") await serviceStatus(env);
    else {
      console.error("Usage: grindeasy service <install|uninstall|status>");
      process.exit(1);
    }
    return;
  }

  if (process.argv[2] === "tools") {
    await runToolsCommand(process.argv[3]);
    return;
  }

  let { config } = loadConfig();

  // Never start a second tracker: if an agent (the service, or another run) is
  // already answering on the stats port, show its status and exit. Two trackers
  // on one token is exactly what trips the server's per-token 429.
  const alreadyRunning = await isAgentRunning(config.statsPort);
  if (alreadyRunning) {
    printAlreadyRunning(alreadyRunning);
    return;
  }

  // First interactive run (or when a new tool appears): discovery + leaderboard +
  // service, in one branded flow. Skipped entirely without a TTY and once nothing
  // is left to ask, so a daily foreground run goes straight to the status block.
  let accountToken = config.accountToken;
  if (needsOnboarding(config)) {
    const result = await runOnboarding(config);
    if (result.serviceInstalled) return; // a background service now owns tracking
    accountToken = result.accountToken;
    // Reload to pick up tools the user just enabled and flags just persisted.
    config = loadConfig().config;
  }

  const dir = dataDir();
  const plan = detectPlan({ declaredPlan: config.declaredPlan });
  const stats = loadStats(dir);
  const tools = trackedTools(config.enabledToolIds, config.customTools);
  const tracker = new Tracker({
    comboBucketMs: config.comboBucketMs,
    maxElapsedMs: config.pollIntervalMs * 3,
  });

  let activeNames: string[] = [];
  let sessionStartMs: number | null = null;
  let lastActiveMs = 0;
  let lastActiveNames: string[] = [];

  const presence = new PresenceManager({
    clientId: config.discordClientId,
    donateUrl: config.donateUrl,
    showIdlePresence: config.showIdlePresence,
  });
  presence.start();

  const sync = new SyncClient({
    serverUrl: config.serverUrl,
    accountToken,
    syncIntervalMs: config.syncIntervalMs,
    activeSyncIntervalMs: config.activeSyncIntervalMs,
  });

  const server = startStatsServer(config.statsPort, () =>
    buildSnapshot(stats, plan, activeNames, config.donateUrl, Date.now(), sync.state),
  );

  printStartup({
    tier: computeTier(stats),
    plan,
    statsPort: config.statsPort,
    toolNames: tools.map((t) => t.name),
    syncEnabled: sync.enabled,
    serverUrl: config.serverUrl,
  });
  if (!config.discordClientId) printSetupHelp();

  let lastTick = Date.now();
  let running = true;

  async function tick(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastTick;
    lastTick = now;

    const activities = await detectAll(tools, config.activeWindowMs, now);
    tracker.recordTick(stats, activities, now, elapsed);

    const detected = activities.filter((a) => a.active).map((a) => a.name);
    if (detected.length > 0) {
      if (sessionStartMs === null) sessionStartMs = now;
      lastActiveMs = now;
      lastActiveNames = detected;
      activeNames = detected;
    } else if (sessionStartMs !== null && now - lastActiveMs <= SESSION_GRACE_MS) {
      // Inside the lull: hold the card steady on the last known tools instead
      // of flapping to Idle and back every time the model pauses to think.
      activeNames = lastActiveNames;
    } else {
      sessionStartMs = null;
      activeNames = [];
    }

    presence.update({
      activeToolNames: activeNames,
      tier: computeTier(stats),
      plan,
      sessionStartMs,
      // Whatever the last sync learned. Null until the first one lands, and
      // null forever if the user never joined the board.
      rank: sync.state.rank,
    });
    saveStats(dir, stats);
    // Report presence to the board as tool *ids* (the leaderboard keys tools by
    // id), mapped back from the display names the session logic tracks.
    const activeToolIds = tools.filter((t) => activeNames.includes(t.name)).map((t) => t.id);
    void sync.maybeSync(stats, plan, now, activeNames.length > 0, activeToolIds);
  }

  async function loop(): Promise<void> {
    while (running) {
      try {
        await tick();
      } catch (err) {
        console.warn(`[loop] tick failed: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  }

  async function shutdown(): Promise<void> {
    if (!running) return;
    running = false;
    console.log("\n[grindeasy] saving and shutting down…");
    saveStats(dir, stats);
    server.close();
    await presence.destroy();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await loop();
}

main().catch((err) => {
  console.error("[grindeasy] fatal:", err);
  process.exit(1);
});
