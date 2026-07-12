import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dataDir } from "./config.js";
import { REPO_URL } from "./presence.js";
import type { Snapshot } from "./snapshot.js";
import { panel } from "./theme.js";

/**
 * Install grindeasy as a per-user background service so tracking survives closing
 * the terminal and a reboot, with no hand-edited unit files and no admin/UAC.
 *
 * The design goal on every platform is identical to systemd's `Restart=always` +
 * boot-survival: the OS (Linux/macOS) or a supervisor loop (Windows) keeps the
 * agent alive while the user is logged in. Everything that decides *what to write*
 * is a pure function (`artifacts`, `enableCommands`, `disableCommands`) so all
 * three platforms' output can be tested on any one of them.
 */

const LAUNCHD_LABEL = "tech.grindeasy";
const WIN_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WIN_RUN_VALUE = "grindeasy";

/**
 * The launch command, resolved through a login shell rather than an absolute node
 * path. PATH is rebuilt on a node upgrade; hardcoding a versioned prefix would
 * silently break the unit. `exec` keeps the agent as the main process, not a
 * wrapper shell.
 */
const LOGIN_SHELL = "/bin/bash";
const LOGIN_SHELL_ARGS = ["-lc", "exec grindeasy"];

// ── Paths ────────────────────────────────────────────────────────────────────

function systemdUnitPath(home: string): string {
  return join(home, ".config", "systemd", "user", "grindeasy.service");
}

function launchdPlistPath(home: string): string {
  return join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function supervisorVbsPath(home: string): string {
  // Kept alongside the rest of grindeasy's runtime data so uninstall has one
  // directory to reason about.
  return join(dataDir(home), "supervise.vbs");
}

function serviceLogPath(home: string): string {
  return join(dataDir(home), "service.log");
}

// ── Pure generators (tested for all three platforms on any host) ─────────────

/** The launch value the Windows Run key points at: wscript runs the .vbs windowless. */
function winRunData(home: string): string {
  return `wscript.exe "${supervisorVbsPath(home)}"`;
}

export function renderSystemdUnit(): string {
  return `[Unit]
Description=grindeasy — coding time tracker + Discord Rich Presence
Documentation=${REPO_URL}
After=default.target
# Never give up: the default (5 failures in 10s) would leave tracking silently
# dead after a transient fault, and nothing else would notice.
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=${LOGIN_SHELL} -lc 'exec grindeasy'
Restart=always
RestartSec=10s
# A background tracker must never compete with the editor or compiler it watches.
Nice=10

[Install]
WantedBy=default.target
`;
}

export function renderLaunchdPlist(home: string): string {
  const log = serviceLogPath(home);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${LOGIN_SHELL}</string>
    <string>-lc</string>
    <string>exec grindeasy</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

export function renderSupervisorVbs(): string {
  // Task Scheduler's restart-on-failure only fires when a task fails to *start*,
  // so a crashed long-running agent is never restarted by it. This loop is the
  // crash-restart mechanism instead — the Run key only handles logon survival.
  // `0` = hidden window, `True` = wait for the agent to exit before looping.
  return `' grindeasy supervisor — restarts the agent forever, hidden, with backoff.
' Written by \`grindeasy service install\`; removed by \`grindeasy service uninstall\`.
Set sh = CreateObject("WScript.Shell")
Do
  sh.Run "cmd /c grindeasy", 0, True
  WScript.Sleep 10000
Loop
`;
}

export interface Artifact {
  path: string;
  content: string;
  /** POSIX mode, when the file must be executable/private. */
  mode?: number;
}

/** Files the install writes for a platform. Pure. */
export function artifacts(platform: NodeJS.Platform, home: string): Artifact[] {
  if (platform === "linux") {
    return [{ path: systemdUnitPath(home), content: renderSystemdUnit() }];
  }
  if (platform === "darwin") {
    return [{ path: launchdPlistPath(home), content: renderLaunchdPlist(home) }];
  }
  if (platform === "win32") {
    return [{ path: supervisorVbsPath(home), content: renderSupervisorVbs() }];
  }
  return [];
}

/** Commands that register + start the service after the files are written. Pure. */
export function enableCommands(platform: NodeJS.Platform, home: string): string[][] {
  if (platform === "linux") {
    return [
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "enable", "--now", "grindeasy"],
      // Survive logout too. Best-effort: on a normal desktop the user is logged
      // in whenever they're coding, so this failing is not fatal.
      ["loginctl", "enable-linger"],
    ];
  }
  if (platform === "darwin") {
    return [["launchctl", "bootstrap", `gui/${uid()}`, launchdPlistPath(home)]];
  }
  if (platform === "win32") {
    return [
      ["reg", "add", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/t", "REG_SZ", "/d", winRunData(home), "/f"],
    ];
  }
  return [];
}

/** Commands that stop + deregister the service. Pure. */
export function disableCommands(platform: NodeJS.Platform, home: string): string[][] {
  if (platform === "linux") {
    return [
      ["systemctl", "--user", "disable", "--now", "grindeasy"],
      ["systemctl", "--user", "daemon-reload"],
    ];
  }
  if (platform === "darwin") {
    return [["launchctl", "bootout", `gui/${uid()}/${LAUNCHD_LABEL}`]];
  }
  if (platform === "win32") {
    return [
      ["reg", "delete", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/f"],
      // Best-effort: stop the running supervisor and the agent it launched so the
      // user doesn't have to log out to fully stop tracking. Matching on the .vbs
      // path avoids killing unrelated wscript/node processes.
      [
        "powershell",
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%supervise.vbs%' OR Name = 'grindeasy'\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
    ];
  }
  return [];
}

/** Whether an install has left its primary artifact on disk. */
export function isInstalled(platform: NodeJS.Platform, home: string): boolean {
  const primary = artifacts(platform, home)[0];
  return primary ? existsSync(primary.path) : false;
}

export function platformSupported(platform: NodeJS.Platform): boolean {
  return platform === "linux" || platform === "darwin" || platform === "win32";
}

// ── Runner + environment injection ───────────────────────────────────────────

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;

const defaultRunner: Runner = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
          ? Number((err as { code: number }).code)
          : err
            ? 1
            : 0;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });

export interface ServiceEnv {
  home: string;
  platform: NodeJS.Platform;
  statsPort: number;
  run: Runner;
  fetchFn: typeof fetch;
  /** Spawn the Windows supervisor detached (real install) — injectable for tests. */
  spawnSupervisor: (home: string) => void;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

function uid(): number {
  return typeof process.getuid === "function" ? process.getuid() : 0;
}

function realSpawnSupervisor(home: string): void {
  // Launch the hidden supervisor loop now, so tracking starts without waiting for
  // the next logon. Detached + unref so it outlives this install process.
  const child = spawn("wscript.exe", [supervisorVbsPath(home)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function resolveEnv(env: Partial<ServiceEnv> | undefined): ServiceEnv {
  return {
    home: env?.home ?? homedir(),
    platform: env?.platform ?? process.platform,
    statsPort: env?.statsPort ?? 4599,
    run: env?.run ?? defaultRunner,
    fetchFn: env?.fetchFn ?? fetch,
    spawnSupervisor: env?.spawnSupervisor ?? realSpawnSupervisor,
    sleep: env?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    log: env?.log ?? ((m) => console.log(m)),
  };
}

// ── Liveness probe (the duplicate guard + verify) ────────────────────────────

/**
 * Ask the local stats server whether an agent is already tracking. A 200 with a
 * parseable snapshot means one is live — which is exactly the condition that
 * causes the server's per-token 429 if a second tracker starts. Any error → null.
 */
export async function isAgentRunning(
  statsPort: number,
  fetchFn: typeof fetch = fetch,
): Promise<Snapshot | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 700);
  try {
    const res = await fetchFn(`http://127.0.0.1:${statsPort}/api/stats`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Status rendering (pure) ──────────────────────────────────────────────────

function fmtHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`;
}

function syncLine(s: Snapshot): string {
  if (!s.sync) return "local only";
  if (s.sync.status === "ok") return `✓ last ${s.sync.lastSyncAt ?? "—"}`;
  if (s.sync.status === "error") return `failed: ${s.sync.lastError ?? "unknown"}`;
  return "pending…";
}

/** The "already running / status" block shown by the duplicate guard and status. */
export function renderRunningStatus(s: Snapshot): string {
  const rank =
    s.sync && s.sync.rank !== null && s.sync.rank !== undefined
      ? `#${s.sync.rank}${s.sync.totalPlayers ? ` of ${s.sync.totalPlayers}` : ""}`
      : "—";
  const active = s.activeNow.length > 0 ? s.activeNow.join(" + ") : "Idle";
  return panel("grindeasy", [
    `Rank      ${rank}`,
    `Today     ${fmtHours(todayHours(s))}`,
    `Total     ${fmtHours(s.totalHours)}`,
    `Active    ${active}`,
    `Sync      ${syncLine(s)}`,
  ]);
}

function todayHours(s: Snapshot): number {
  // The snapshot doesn't carry a per-day figure; total is the honest number to
  // show here without recomputing. Kept as a helper so a future daily field is a
  // one-line change.
  return s.totalHours;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

async function runAll(env: ServiceEnv, commands: string[][]): Promise<void> {
  for (const [cmd, ...args] of commands) {
    const r = await env.run(cmd!, args);
    if (r.code !== 0) {
      // enable-linger and the Windows best-effort kill are allowed to fail.
      const optional = cmd === "loginctl" || cmd === "powershell";
      const detail = (r.stderr || r.stdout).trim();
      if (optional) {
        env.log(`  (note: \`${cmd} ${args.join(" ")}\` exited ${r.code}${detail ? ` — ${detail}` : ""})`);
      } else {
        throw new Error(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.code})${detail ? `: ${detail}` : ""}`);
      }
    }
  }
}

/**
 * Returns true when the background service is now in charge of tracking — the
 * caller (onboarding) should then exit its foreground process so the two never
 * run at once. Returns false when it fell back to foreground (unsupported,
 * install failed) so tracking still happens.
 */
export async function installService(envIn?: Partial<ServiceEnv>): Promise<boolean> {
  const env = resolveEnv(envIn);
  const { platform, home } = env;

  if (!platformSupported(platform)) {
    env.log(`Background service isn't supported on ${platform}. Keep this terminal open instead.`);
    return false;
  }
  if (isInstalled(platform, home)) {
    env.log("grindeasy service is already installed. Use `grindeasy service status`.");
    return true;
  }

  // Write artifacts first; the enable step consumes them.
  for (const a of artifacts(platform, home)) {
    mkdirSync(join(a.path, ".."), { recursive: true });
    writeFileSync(a.path, a.content, { mode: a.mode ?? 0o644 });
  }

  try {
    await runAll(env, enableCommands(platform, home));
    if (platform === "win32") env.spawnSupervisor(home);
  } catch (err) {
    // Never leave a half-installed service behind.
    for (const a of artifacts(platform, home)) rmSync(a.path, { force: true });
    env.log(`Install failed: ${(err as Error).message}`);
    env.log("Falling back to foreground — keep this terminal open to keep tracking.");
    return false;
  }

  // Verify by watching for the agent to answer on its stats port.
  const snap = await waitForAgent(env);
  if (snap) {
    env.log("\n✓ grindeasy is now running in the background.");
    env.log("  It survives closing this terminal and reboots (while you're logged in).");
    env.log("  Check it any time:  grindeasy service status");
    env.log("  Stop it:            grindeasy service uninstall\n");
  } else {
    env.log("\n⚠ Service installed, but it hasn't reported in yet.");
    env.log(`  Give it a moment, then run:  grindeasy service status`);
    if (platform === "darwin" || platform === "linux") {
      env.log(`  Logs / status via the OS may help if it doesn't come up.\n`);
    }
  }
  // The unit is enabled either way; hand off so we don't double-track.
  return true;
}

async function waitForAgent(env: ServiceEnv): Promise<Snapshot | null> {
  for (let i = 0; i < 8; i++) {
    const snap = await isAgentRunning(env.statsPort, env.fetchFn);
    if (snap) return snap;
    await env.sleep(1000);
  }
  return null;
}

export async function uninstallService(envIn?: Partial<ServiceEnv>): Promise<void> {
  const env = resolveEnv(envIn);
  const { platform, home } = env;

  if (!platformSupported(platform)) {
    env.log(`Nothing to uninstall on ${platform}.`);
    return;
  }
  if (!isInstalled(platform, home)) {
    env.log("No grindeasy service is installed.");
    return;
  }

  // Disable/stop first (some commands need the files), then remove the files.
  await runAll(env, disableCommands(platform, home)).catch((err) => {
    env.log(`  (note: ${(err as Error).message})`);
  });
  for (const a of artifacts(platform, home)) rmSync(a.path, { force: true });

  env.log("✓ grindeasy background service removed. Your token and stats are untouched.");
  if (platform === "win32") {
    env.log("  If tracking is still running from before uninstall, a reboot clears it.");
  }
}

export async function serviceStatus(envIn?: Partial<ServiceEnv>): Promise<void> {
  const env = resolveEnv(envIn);
  const { platform, home } = env;

  const installed = isInstalled(platform, home);
  const snap = await isAgentRunning(env.statsPort, env.fetchFn);

  env.log(`Service   ${installed ? "installed" : "not installed"} (${platform})`);
  env.log(`Agent     ${snap ? "running" : "not running"}`);
  if (snap) {
    env.log("");
    env.log(renderRunningStatus(snap));
  } else if (!installed) {
    env.log("\nInstall it with:  grindeasy service install");
  }
}
