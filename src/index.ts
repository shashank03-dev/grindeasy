#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { loadConfig, dataDir, configPath, updateConfig, type Config } from "./config.js";
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

/**
 * Offer the leaderboard once, on the first interactive run. Sync stays opt-in —
 * nothing is sent anywhere unless a human answers yes — but nobody has to know
 * that `grindeasy login` exists to find the board.
 *
 * Returns the account token if pairing completed, else "".
 */
async function offerLeaderboard(config: Config): Promise<string> {
  const eligible =
    config.serverUrl &&
    !config.accountToken &&
    !config.askedToJoinBoard &&
    process.stdin.isTTY;
  if (!eligible) return "";

  // Asked, whatever the answer — we never nag twice.
  updateConfig({ askedToJoinBoard: true });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await rl.question("\n  Join the global leaderboard? [Y/n] ");
  } finally {
    rl.close();
  }
  if (/^n/i.test(answer.trim())) {
    console.log(`  No problem — staying local. Run \`grindeasy login\` any time.\n`);
    return "";
  }

  try {
    const token = await pairWithBoard(config.serverUrl);
    console.log(`\n  ✓ Joined. Your rank now shows on your Discord card.\n`);
    return token;
  } catch (err) {
    // A failed pairing must never stop the agent: the card and local tracking
    // work perfectly well without a board.
    console.warn(`  Pairing didn't finish (${(err as Error).message}).`);
    console.warn(`  Run \`grindeasy login\` to try again.\n`);
    return "";
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "login") {
    await login();
    return;
  }

  const { config } = loadConfig();
  const accountToken = config.accountToken || (await offerLeaderboard(config));
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

  const startTier = computeTier(stats);
  console.log(`⚡ grindeasy running`);
  console.log(`   tier      ${startTier.glyph} ${startTier.name}  ·  plan ${planBadge(plan)}`);
  console.log(`   dashboard http://localhost:${config.statsPort}`);
  console.log(`   tools     ${tools.map((t) => t.name).join(", ")}`);
  console.log(
    `   sync      ${
      sync.enabled ? `→ ${config.serverUrl}` : "off — run `grindeasy login` to join the board"
    }`,
  );
  console.log(`   repo      ${REPO_URL}`);
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
    void sync.maybeSync(stats, plan, now, activeNames.length > 0);
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
