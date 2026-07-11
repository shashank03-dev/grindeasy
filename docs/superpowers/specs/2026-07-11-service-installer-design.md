# Background service installer (`grindeasy service …`)

**Date:** 2026-07-11
**Status:** Draft — awaiting approval

## Problem

The agent is a foreground process. Closing the terminal sends SIGHUP to its
process group and tracking dies; a reboot ends it too. Today the only way to make
it persist is to hand-write a systemd unit — which I did, on one Linux machine,
last session. That persistence ships to nobody: a first-time user who runs
`npx grindeasy` must keep that terminal open forever, and the README never says
otherwise.

The goal grindeasy is built around — "your coding time counts on the board" —
silently stops the moment the user closes their editor's terminal. That is the
gap this closes.

Two concrete constraints discovered last session that the design must respect:

1. **Two agents on one token → HTTP 429 loop.** The server enforces
   `MIN_INGEST_GAP_MS = 60_000` per token. A background service plus a manually
   run `npx grindeasy` sync ~30s apart and both get rate-limited. Any install
   flow that leaves two trackers running reproduces this exactly.
2. **A systemd service can never run onboarding.** `offerLeaderboard()` gates on
   `process.stdin.isTTY`, and a service has no TTY. Pairing must therefore happen
   in the foreground *before* the hand-off to the service.

## Goals

- `grindeasy service install` makes the agent survive closing the terminal **and**
  a reboot, on Linux, macOS, and Windows — with no hand-edited unit files.
- Offered automatically at the end of onboarding (opt-out), so an ordinary user
  gets persistence without knowing the command exists.
- Running `grindeasy` while a service is already live never starts a second
  tracker (kills the 429 class), and instead shows a live status snapshot.
- `service uninstall` and `service status` round out the lifecycle.

## Non-goals (explicitly cut)

- System-wide / multi-user services (root systemd units, Windows Services proper).
  Per-user only — the agent tracks one user's coding time.
- Running while logged **out**. On all three platforms the agent runs while the
  user is logged in and stops at logout: macOS gui-domain LaunchAgents and the
  Windows Run-key/supervisor both work this way by construction, and it is the
  correct model for a personal coding tracker. (Linux linger is the one that
  *could* run logged-out, but we don't rely on it — a logged-out user isn't
  coding.)
- Elevation. No step may raise a UAC prompt or require `sudo`/admin. This is what
  rules out a native Windows Service (`sc create` needs admin) and a
  logon-triggered Scheduled Task (also needs admin).
- Auto-update of the service definition when grindeasy upgrades. The login-shell
  PATH resolution (below) already makes a Node upgrade a no-op; a grindeasy
  upgrade that changes the launch command is rare and handled by re-running
  `service install`.
- A `--purge` uninstall. Uninstall removes the service only; token and stats stay.

## Decisions (locked with the user)

| Decision | Choice |
|---|---|
| Platform scope | All three: Linux, macOS, Windows |
| Install trigger | Offered during onboarding, opt-out (default yes) |
| Duplicate guard | Detect running agent → print status → exit 0 |
| Windows mechanism | `HKCU\…\Run` autostart → hidden supervisor loop (crash-restart, **no admin**) |
| Uninstall scope | Service definition only — token and stats untouched |

The Windows mechanism was reconsidered after research (see "Windows in detail"
below): the originally-planned logon-triggered Scheduled Task both fails to
restart a crashed process *and* requires admin elevation, so it was replaced with
a Run-key + supervisor-loop approach that gives crash-restart with no UAC prompt.

## Design

### 1. `src/service.ts` — all platform logic

One new module. Each verb is one exported function with a `switch (process.platform)`
inside, mirroring the single existing platform branch in `src/pair.ts:84`. No new
runtime dependencies — everything shells out to tooling already present on each OS
(`systemctl`/`loginctl`, `launchctl`, `schtasks`) via `node:child_process`.

**`isAgentRunning(statsPort): Promise<Snapshot | null>`**
A `GET http://127.0.0.1:{statsPort}/api/stats` with a short timeout (≈500ms). The
stats server (`src/statsServer.ts`) already serves the full `Snapshot` as JSON on
this port. A parsed 200 means an agent is live *and* hands us everything the
status view needs (rank via `snapshot.sync`, hours, active tools). Any error →
null. This is the cross-platform liveness probe; no pidfile needed for the common
case.

> Note: the probe answers "is *an* agent listening on this port", which is
> exactly the condition that causes the 429 (a second tracker on the same token).
> It does not distinguish "service" from "stray foreground run" — and it does not
> need to; either way, starting another tracker is wrong.

**`installService(): Promise<void>`**
Generates the platform artifact from a pure function (`renderUnit(platform, ctx)`,
testable in isolation), writes it, enables it, then **verifies** by polling
`isAgentRunning()` for a few seconds and reporting success or a diagnostic.

| Platform | Artifact | Enable commands |
|---|---|---|
| linux | `~/.config/systemd/user/grindeasy.service` | `systemctl --user daemon-reload`, `systemctl --user enable --now grindeasy`, `loginctl enable-linger $USER` |
| darwin | `~/Library/LaunchAgents/tech.grindeasy.plist` | `launchctl bootstrap gui/$UID <plist>` (fallback `launchctl load`) |
| win32 | `%LOCALAPPDATA%\grindeasy\supervise.vbs` + `HKCU\…\Run\grindeasy` value | `reg add "HKCU\…\Run" /v grindeasy /d "wscript …\supervise.vbs" /f`, then spawn the supervisor now |

**`uninstallService(): Promise<void>`**
Stop → disable → remove the artifact. Token, config, and `~/.grindeasy` stats are
left untouched, so `grindeasy` foreground or a later reinstall resumes cleanly.

| Platform | Commands |
|---|---|
| linux | `systemctl --user disable --now grindeasy`, remove unit, `daemon-reload` (linger left as-is) |
| darwin | `launchctl bootout gui/$UID/tech.grindeasy` (fallback `unload`), remove plist |
| win32 | `reg delete "HKCU\…\Run" /v grindeasy /f`, `taskkill` the supervisor + agent, remove the `.vbs` |

**`serviceStatus(): Promise<void>`**
Reports two things: *installed?* (ask the OS — `systemctl --user is-enabled`,
`launchctl print`, `schtasks /query`) and *running?* + live snapshot (via
`isAgentRunning()`). Prints rank, hours today, last sync, presence-connected.

### 2. Launch command — Node-upgrade-proof

The Linux/macOS units launch via a login shell so PATH resolution (built in
`~/.profile` from a glob over `~/.local/opt/*/bin`) is picked up, instead of
hardcoding a versioned node prefix that a Node upgrade silently invalidates —
the exact fragility caught and fixed last session.

- **Linux** `ExecStart=/bin/bash -lc 'exec grindeasy'`. `exec` keeps MainPID as
  the agent, not a wrapper shell.
- **macOS** launchd has no shell; the plist's `ProgramArguments` is
  `["/bin/bash", "-lc", "exec grindeasy"]`, same effect.
- **Windows** the supervisor is what runs; see below. It launches `grindeasy`
  (resolved from the installed npm global on PATH) with a hidden window via
  `WScript.Shell.Run(cmd, 0, True)` — `0` = hidden, `True` = wait for exit so the
  loop can restart it.

### 3a. Windows in detail (the crash-restart workaround)

Native Windows offers no admin-free per-user supervisor equivalent to systemd or
launchd. Two facts, both verified against Microsoft docs, shaped this:

- Task Scheduler's **restart-on-failure only fires when the task can't *start* the
  action** — a process that launches and later crashes is counted as success and
  is *not* restarted. So a Scheduled Task gives no crash-restart for a
  long-running agent.
- A **logon-triggered** Scheduled Task requires admin elevation to create (a UAC
  prompt), which would break the opt-out onboarding flow.

The workaround decouples the two guarantees:

- **Autostart (logon/reboot survival):** a value under
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` — user-writable, no admin,
  visible and disable-able in Task Manager → Startup. It launches the supervisor
  at every interactive logon.
- **Crash-restart:** the Run value points at `supervise.vbs`, a hidden supervisor
  loop:

  ```vbs
  ' supervise.vbs — restart grindeasy forever, hidden, with backoff.
  Set sh = CreateObject("WScript.Shell")
  Do
    sh.Run "cmd /c grindeasy", 0, True   ' 0 = hidden window, True = wait for exit
    WScript.Sleep 10000                  ' 10s backoff, mirrors RestartSec=10s
  Loop
  ```

  The loop restarts a crashed agent, matching systemd `Restart=always`. Because
  it's not a Scheduled Task, the "stop after 3 days" limit never applies.

`installService()` on win32 therefore: writes `supervise.vbs`, writes the Run
value (`reg add`), spawns the supervisor immediately (so the user doesn't have to
log out first), then verifies via `isAgentRunning()`. Only one agent runs at a
time (the loop waits for exit), and the duplicate-guard still blocks a second
manual tracker — so the 429 class stays closed on Windows too.

Alternative considered and rejected: a Startup-folder `.lnk` (needs a COM call to
build the shortcut; the Run key is a plain `reg add`/`reg delete` from
`child_process`) and a real Windows Service via WinSW/nssm (needs admin + a
bundled binary — both cut in non-goals).

### 3. Linux unit hardening (carried from last session, proven on-machine)

```ini
[Unit]
Description=grindeasy — coding time tracker + Discord Rich Presence
Documentation=https://github.com/shashank03-dev/grindeasy
After=default.target
# Never give up: the default (5 failures / 10s) would leave tracking silently
# dead after a transient fault, and nothing else would notice.
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/bin/bash -lc 'exec grindeasy'
Restart=always
RestartSec=10s
Nice=10          # a background tracker must never compete with the editor it watches

[Install]
WantedBy=default.target
```

macOS gets the launchd equivalents: `KeepAlive=true` (crash-restart),
`RunAtLoad=true` (boot/login), `ProcessType=Background` (the `Nice` analogue),
`StandardOutPath`/`StandardErrorPath` to a log under `~/.grindeasy/`.

### 4. `src/index.ts` wiring

**Subcommand dispatch** at the top of `main()`, beside the existing `login`:

```ts
if (process.argv[2] === "service") {
  const verb = process.argv[3];
  if (verb === "install")   return installService();
  if (verb === "uninstall") return uninstallService();
  if (verb === "status")    return serviceStatus();
  // no/unknown verb → short usage, exit 1
}
```

**Duplicate guard**, before the tracker starts (after config load, before the
presence/sync/loop setup):

```ts
const already = await isAgentRunning(config.statsPort);
if (already) { printAlreadyRunning(already); return; }   // never a second tracker
```

`printAlreadyRunning` renders the "show status, then exit" block from the snapshot
(rank, hours today, last sync age, presence connected) and points at
`grindeasy service status`.

**Onboarding hand-off**, right after `offerLeaderboard()` pairs and only when
`process.stdin.isTTY`:

```
✓ Joined the leaderboard!

Keep grindeasy tracking in the background (survives closing this
terminal and reboots)? [Y/n]
```

- yes → `installService()`, print where to check status, `return` (the service is
  now the tracker; the foreground process exits so the two never coexist → no 429).
- no → fall through to the foreground `loop()` exactly as today.

Gated behind a new config flag `askedToInstallService: boolean` (default false,
set once when asked) — same never-nag-twice pattern as `askedToJoinBoard`. Also
skipped if a service is already installed.

### Onboarding data flow

```
npx grindeasy  (first run, TTY)
 ├─ offerLeaderboard()  → device pairing → token written
 ├─ askedToInstallService?  no →
 │    prompt "keep running in background? [Y/n]"
 │      ├─ yes → installService()
 │      │         ├─ write unit/plist/task
 │      │         ├─ enable + linger/RunAtLoad
 │      │         └─ verify via isAgentRunning() → exit foreground
 │      └─ no  → continue to loop() as today
 └─ (service now runs headless; card + sync owned by it)
```

## Error handling

- **Install fails** (no systemd, `launchctl` refuses, `schtasks` access denied):
  `installService()` reports the specific failure and falls back to telling the
  user to keep the terminal open. It never leaves a half-enabled unit — write the
  file only after the enable command that consumes it succeeds, or clean up on
  failure. Onboarding continues to the foreground `loop()` so the user is tracking
  regardless.
- **Verify times out** (unit enabled but `/api/stats` never answers): report it as
  a warning with the log path, not a hard failure — the unit may just be slow to
  boot. Do not silently claim success (verification-before-completion).
- **`service status` when nothing is installed**: plain "not installed" + the
  install hint, exit 0.
- **Duplicate guard false-negative** (agent alive but stats port busy/changed):
  worst case is the pre-existing 429 behavior, which `SyncClient` already handles
  by honoring `retryAfterS`. No regression.
- **Windows without a hidden launcher available** (`wscript` missing, unlikely):
  fall back to a visible minimized window and say so.

## Testing

- **`renderUnit(platform, ctx)` is pure** — given home dir + platform → exact file
  bytes. Unit-test all three platforms' generated artifacts on this Linux box; no
  mac/Windows host required. Assert: correct paths, `StartLimitIntervalSec=0`, the
  login-shell ExecStart, KeepAlive/RunAtLoad on the plist, and on win32 the exact
  `supervise.vbs` body + the `HKCU\…\Run` value that points at it.
- **`isAgentRunning()`** against a stub HTTP server: 200 snapshot → parsed;
  connection refused → null; timeout → null; non-JSON 200 → null.
- **Enable/disable shell-outs** wrapped in an injectable runner so tests assert the
  command sequence without executing it.
- **index dispatch**: `service <verb>` routes correctly; unknown verb → usage +
  exit 1. Duplicate guard: a live `isAgentRunning` → status printed, `loop()`
  never entered.
- **`test/config.test.ts`**: `askedToInstallService` defaults false; a set value
  survives a load/merge round-trip.
- Target the existing style (`node:test`, 71 tests today), keep them green.

## Known risks / unverified

- **macOS and Windows paths are unproven on real hardware.** This machine is
  Linux; only the systemd path has been validated end-to-end. The pure
  `renderUnit` tests prove the *generated content* is correct, but not that
  `launchctl bootstrap` / the Run-key + `wscript` chain behave as expected on
  those OSes. The design keeps the failure mode graceful (fall back to
  foreground), but first real-world confirmation on mac/Windows should be treated
  as a follow-up validation step.
- **Windows antivirus / SmartScreen heuristics may flag the supervisor.** A hidden
  autostart entry that relaunches a process in a loop is structurally identical to
  how persistence malware behaves, so Defender or third-party AV could warn on or
  quarantine `supervise.vbs` / the Run-key write. This cannot be reproduced on
  this Linux box. If it proves common in the wild, the fallbacks are: sign the
  script, ship the "keep the terminal open" message on Windows, or revisit a
  signed WinSW-based service (which reintroduces the admin + bundled-binary costs
  we cut). Flagging so it's a known, accepted risk rather than a surprise.
- **`launchctl` API churn.** `bootstrap`/`bootout` (modern) vs `load`/`unload`
  (legacy) differ across macOS versions. The design uses modern with a legacy
  fallback; the exact boundary is not verified against Apple docs and should be
  confirmed before claiming macOS support in the README.
- **Boot-survival on Linux is configured but not yet reboot-tested** (`linger` +
  `enable`). Same open item flagged last session.
