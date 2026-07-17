#!/usr/bin/env node
import { createRequire } from "node:module";
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
import {
  buildSnapshot,
  computeRecap,
  computeRecords,
  computeWeekly,
  type Snapshot,
} from "./snapshot.js";
import { startStatsServer } from "./statsServer.js";
import { loadStats, saveStats } from "./store.js";
import { renderWeeklyPanel } from "./weeklyCli.js";
import { formatWeeklyRecap, planWeeklyRecapDelivery, postSlackMessage } from "./webhook.js";
import { SyncClient } from "./sync.js";
import { computeTier } from "./tiers.js";
import { trackedTools } from "./catalog.js";
import { detectAll } from "./tools.js";
import { needsOnboarding, runOnboarding } from "./onboarding.js";
import { runToolsCommand } from "./toolsCli.js";
import * as theme from "./theme.js";
import { Tracker } from "./tracker.js";
import type { Plan, Stats, TierResult } from "./types.js";

// package.json ships in the npm tarball alongside dist/, so it resolves both
// from dist/index.js at runtime and from src/index.ts under tsx in dev.
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

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

/** After a failed webhook post, wait this long before retrying (in-memory only). */
const WEBHOOK_RETRY_BACKOFF_MS = 30 * 60_000;

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

function printHelp(): void {
  const label = (s: string) => theme.fg(s.padEnd(15));
  const lines = [
    theme.dim("Usage: grindeasy [command]"),
    "",
    `${label("(no command)")}${theme.dimmer("start tracking")}`,
    `${label("login")}${theme.dimmer("join the leaderboard")}`,
    `${label("weekly")}${theme.dimmer("your last-7-days summary")}`,
    `${label("service")}${theme.dimmer("install | uninstall | status")}`,
    `${label("tools")}${theme.dimmer("list | scan | add | remove")}`,
    `${label("webhook")}${theme.dimmer("test — post a recap to your Slack webhook")}`,
    "",
    `${label("-h, --help")}${theme.dimmer("show this")}`,
    `${label("-v, --version")}${theme.dimmer("print version")}`,
  ];
  console.log(theme.banner() + "\n" + theme.panel("commands", lines) + "\n");
}

/**
 * Print last week's recap once, the first interactive run of each new ISO week.
 * Stores the current week key even when there's nothing to show, so it fires at
 * most once per week and never on the background service (no TTY). Mutates and
 * persists `stats.lastRecapWeek`.
 */
function maybeShowWeeklyRecap(stats: Stats, dir: string, goalHours: number): void {
  if (!process.stdout.isTTY) return;
  const recap = computeRecap(stats, Date.now(), goalHours);
  if (stats.lastRecapWeek === recap.currentWeek) return;
  stats.lastRecapWeek = recap.currentWeek;
  saveStats(dir, stats);
  if (!recap.summary) return;
  console.log("\n" + renderWeeklyPanel(recap.summary, { title: "last week" }) + "\n");
}

/**
 * Show last week's recap under `service status`. The auto recap only fires on an
 * interactive start, which a background-service user never sees — the service has
 * no TTY, and a foreground run stops at the duplicate guard before reaching it.
 * `service status` is the check-in they do run, so it's where the recap belongs.
 *
 * Read-only on purpose: the running service holds stats in memory and rewrites
 * the file every tick, so persisting a "shown" marker here would be clobbered on
 * its next save. Nothing is stored, so this stays correct to show every time.
 */
function showLastWeekRecap(goalHours: number): void {
  const stats = loadStats(dataDir());
  const recap = computeRecap(stats, Date.now(), goalHours);
  if (!recap.summary) return;
  const records = computeRecords(stats);
  console.log("\n" + renderWeeklyPanel(recap.summary, { title: "last week", records }) + "\n");
}

/**
 * `grindeasy webhook test` — post a message to the configured Slack webhook now,
 * so the user can confirm the URL works before trusting the weekly auto-post.
 * Sends last week's recap if there is one, else the rolling 7-day summary, else
 * a plain confirmation line when there's no activity to report yet.
 */
async function runWebhookCommand(verb: string | undefined): Promise<void> {
  if (verb !== "test") {
    console.error("Usage: grindeasy webhook test");
    process.exit(1);
  }
  const { config } = loadConfig();
  if (!config.slackWebhookUrl) {
    console.error(
      `No slackWebhookUrl configured. Add a Slack Incoming Webhook URL under\n` +
        `"slackWebhookUrl" in ${configPath()}, then run this again.`,
    );
    process.exit(1);
  }
  const stats = loadStats(dataDir());
  const now = Date.now();
  const recap = computeRecap(stats, now, config.weeklyGoalHours);
  const rolling = computeWeekly(stats, now, config.weeklyGoalHours);
  const text = recap.summary
    ? formatWeeklyRecap(recap.summary)
    : rolling.activeHours > 0
      ? formatWeeklyRecap(rolling)
      : "*grindeasy* — webhook connected. No activity to report yet.";
  const result = await postSlackMessage(config.slackWebhookUrl, text);
  if (result.ok) {
    console.log("✓ Sent a test message to your Slack webhook.");
  } else {
    console.error(`✗ Slack post failed: ${result.error}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];

  if (cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }

  if (cmd === "-v" || cmd === "--version") {
    console.log(pkg.version);
    return;
  }

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
    else if (verb === "status") {
      await serviceStatus(env);
      showLastWeekRecap(config.weeklyGoalHours);
    } else {
      console.error("Usage: grindeasy service <install|uninstall|status>");
      process.exit(1);
    }
    return;
  }

  if (process.argv[2] === "tools") {
    await runToolsCommand(process.argv[3]);
    return;
  }

  if (process.argv[2] === "weekly") {
    const { config } = loadConfig();
    const stats = loadStats(dataDir());
    const weekly = computeWeekly(stats, Date.now(), config.weeklyGoalHours);
    const records = computeRecords(stats);
    console.log("\n" + renderWeeklyPanel(weekly, { records }) + "\n");
    return;
  }

  if (process.argv[2] === "webhook") {
    await runWebhookCommand(process.argv[3]);
    return;
  }

  // Anything left that isn't empty is a typo, not the no-arg tracker start.
  // Guard it so `grindeasy halp` prints usage instead of silently tracking.
  if (cmd !== undefined) {
    console.error(`Unknown command: ${cmd}`);
    console.error("Run `grindeasy --help` for usage.");
    process.exit(1);
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
    buildSnapshot(
      stats,
      plan,
      activeNames,
      config.donateUrl,
      Date.now(),
      sync.state,
      config.weeklyGoalHours,
    ),
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
  maybeShowWeeklyRecap(stats, dir, config.weeklyGoalHours);

  let lastTick = Date.now();
  let running = true;
  // In-memory backoff after a failed Slack post, so a bad URL or an outage
  // doesn't spam the network (or the log) every tick. Reset per process start.
  let nextWebhookAttemptMs = 0;

  /**
   * Once each new ISO week begins, post last week's recap to the configured
   * Slack webhook exactly once. Persists the posted week only on success (or when
   * there's nothing to send), so a failed post retries after the backoff.
   */
  async function maybePostWeeklyRecap(now: number): Promise<void> {
    const recap = computeRecap(stats, now, config.weeklyGoalHours);
    const action = planWeeklyRecapDelivery({
      webhookUrl: config.slackWebhookUrl,
      lastWebhookRecapWeek: stats.lastWebhookRecapWeek,
      recap,
      now,
      nextAttemptMs: nextWebhookAttemptMs,
    });
    if (action.kind === "skip") return;
    if (action.kind === "mark") {
      stats.lastWebhookRecapWeek = action.week;
      saveStats(dir, stats);
      return;
    }
    const result = await postSlackMessage(config.slackWebhookUrl, action.text);
    if (result.ok) {
      stats.lastWebhookRecapWeek = action.week;
      saveStats(dir, stats);
      console.log("[webhook] posted last week's recap to Slack");
    } else {
      nextWebhookAttemptMs = now + WEBHOOK_RETRY_BACKOFF_MS;
      console.warn(`[webhook] Slack post failed (${result.error}); retrying in 30m`);
    }
  }

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

    await maybePostWeeklyRecap(now);
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
