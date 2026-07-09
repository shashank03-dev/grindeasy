#!/usr/bin/env node
import { loadConfig, dataDir, configPath, updateConfig } from "./config.js";
import { openBrowser, pair } from "./pair.js";
import { detectPlan, planBadge } from "./plan.js";
import { PresenceManager, REPO_URL } from "./presence.js";
import { buildSnapshot } from "./snapshot.js";
import { startStatsServer } from "./statsServer.js";
import { loadStats, saveStats } from "./store.js";
import { SyncClient } from "./sync.js";
import { computeTier } from "./tiers.js";
import { detectAll, defaultTools } from "./tools.js";
import { Tracker } from "./tracker.js";

/**
 * Only reachable when OFFICIAL_DISCORD_APP_ID is unset (self-hosters, or if
 * Discord ever disallows a shared application). The happy path shows nothing.
 */
function printSetupHelp(): void {
  console.log(`
┌─ viberank setup ────────────────────────────────────────────┐
  No Discord Application ID is configured, so the card is off.
  Tracking and the leaderboard still work without it.

  To enable the card, create a free application at
    https://discord.com/developers/applications
  upload a Rich Presence art asset named "viberank", then set
    "discordClientId" in ${configPath()}
└─────────────────────────────────────────────────────────────┘
`);
}

/**
 * `viberank login` — pair this machine with the leaderboard. The user clicks one
 * button in a browser; the agent writes its own token. No file editing.
 */
async function login(): Promise<void> {
  const { config } = loadConfig();
  if (!config.serverUrl) {
    console.error("No serverUrl configured, so there is nothing to pair with.");
    process.exit(1);
  }

  const token = await pair({
    serverUrl: config.serverUrl,
    onPrompt: (info) => {
      console.log(`\n  Confirm this code in your browser:  ${info.userCode}\n`);
      console.log(`  ${info.verifyUrl}\n`);
      console.log(`  Waiting for you to authorize…`);
      openBrowser(info.verifyUrl);
    },
  });

  updateConfig({ accountToken: token });
  console.log(`\n  ✓ Paired. Run \`viberank\` and your time starts counting.\n`);
}

async function main(): Promise<void> {
  if (process.argv[2] === "login") {
    await login();
    return;
  }

  const { config, created } = loadConfig();
  const dir = dataDir();
  const plan = detectPlan({ declaredPlan: config.declaredPlan });
  const stats = loadStats(dir);
  const tools = config.tools.length ? config.tools : defaultTools();
  const tracker = new Tracker({
    comboBucketMs: config.comboBucketMs,
    maxElapsedMs: config.pollIntervalMs * 3,
  });

  let activeNames: string[] = [];
  let sessionStartMs: number | null = null;

  const presence = new PresenceManager({
    clientId: config.discordClientId,
    donateUrl: config.donateUrl,
    showIdlePresence: config.showIdlePresence,
  });
  presence.start();

  const sync = new SyncClient({
    serverUrl: config.serverUrl,
    accountToken: config.accountToken,
    syncIntervalMs: config.syncIntervalMs,
  });

  const server = startStatsServer(config.statsPort, () =>
    buildSnapshot(stats, plan, activeNames, config.donateUrl, Date.now(), sync.state),
  );

  const startTier = computeTier(stats);
  console.log(`⚡ viberank running`);
  console.log(`   tier      ${startTier.glyph} ${startTier.name}  ·  plan ${planBadge(plan)}`);
  console.log(`   dashboard http://localhost:${config.statsPort}`);
  console.log(`   tools     ${tools.map((t) => t.name).join(", ")}`);
  console.log(
    `   sync      ${
      sync.enabled ? `→ ${config.serverUrl}` : "off — run `viberank login` to join the board"
    }`,
  );
  console.log(`   repo      ${REPO_URL}`);
  if (created || !config.discordClientId) printSetupHelp();

  let lastTick = Date.now();
  let running = true;

  async function tick(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastTick;
    lastTick = now;

    const activities = await detectAll(tools, config.activeWindowMs, now);
    tracker.recordTick(stats, activities, now, elapsed);

    activeNames = activities.filter((a) => a.active).map((a) => a.name);
    if (activeNames.length > 0) {
      if (sessionStartMs === null) sessionStartMs = now;
    } else {
      sessionStartMs = null;
    }

    presence.update({
      activeToolNames: activeNames,
      tier: computeTier(stats),
      plan,
      sessionStartMs,
    });
    saveStats(dir, stats);
    void sync.maybeSync(stats, plan, now);
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
    console.log("\n[viberank] saving and shutting down…");
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
  console.error("[viberank] fatal:", err);
  process.exit(1);
});
