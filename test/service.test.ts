import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  artifacts,
  disableCommands,
  enableCommands,
  installService,
  isAgentRunning,
  isInstalled,
  renderRunningStatus,
  renderSupervisorVbs,
  renderSystemdUnit,
  serviceStatus,
  uninstallService,
  withoutNpxPath,
  type RunResult,
  type RunOpts,
  type ServiceEnv,
} from "../src/service.js";
import type { Snapshot } from "../src/snapshot.js";

// ── Pure generators, checked for every platform on this one host ─────────────

describe("withoutNpxPath()", () => {
  it("drops _npx bin dirs and keeps everything else in order", () => {
    const path = "/home/u/.npm/_npx/abc/node_modules/.bin:/home/u/.local/bin:/usr/bin";
    expect(withoutNpxPath(path)).toBe("/home/u/.local/bin:/usr/bin");
  });

  it("is a no-op when no _npx segment is present", () => {
    expect(withoutNpxPath("/usr/local/bin:/usr/bin")).toBe("/usr/local/bin:/usr/bin");
  });

  it("passes undefined through (no PATH set)", () => {
    expect(withoutNpxPath(undefined)).toBeUndefined();
  });

  it("splits on the given separator (Windows `;`)", () => {
    const path =
      "C:\\npm-cache\\_npx\\abc\\node_modules\\.bin;C:\\Users\\u\\AppData\\Roaming\\npm;C:\\Windows";
    expect(withoutNpxPath(path, ";")).toBe(
      "C:\\Users\\u\\AppData\\Roaming\\npm;C:\\Windows",
    );
  });
});

describe("artifacts()", () => {
  it("linux writes the systemd user unit", () => {
    const [a, ...rest] = artifacts("linux", "/home/u");
    expect(rest).toHaveLength(0);
    expect(a!.path).toBe("/home/u/.config/systemd/user/grindeasy.service");
    expect(a!.content).toContain("Restart=always");
    expect(a!.content).toContain("StartLimitIntervalSec=0");
    expect(a!.content).toContain("ExecStart=/bin/bash -lc 'exec grindeasy'");
  });

  it("darwin writes the launchd plist with KeepAlive + RunAtLoad", () => {
    const [a] = artifacts("darwin", "/Users/u");
    expect(a!.path).toBe("/Users/u/Library/LaunchAgents/tech.grindeasy.plist");
    expect(a!.content).toContain("<key>KeepAlive</key>");
    expect(a!.content).toContain("<key>RunAtLoad</key>");
    expect(a!.content).toContain("<string>exec grindeasy</string>");
    // launchd has no shell, so the login shell is the program itself.
    expect(a!.content).toContain("<string>/bin/bash</string>");
  });

  it("win32 writes the supervisor vbs in the grindeasy data dir", () => {
    const [a] = artifacts("win32", "C:/Users/u");
    expect(a!.path).toContain("supervise.vbs");
    expect(a!.path).toContain(".grindeasy");
    // The loop is the crash-restart mechanism; hidden + wait-for-exit.
    expect(a!.content).toContain('sh.Run "cmd /c grindeasy", 0, True');
    expect(a!.content).toContain("Loop");
  });

  it("returns nothing for an unsupported platform", () => {
    expect(artifacts("freebsd" as NodeJS.Platform, "/home/u")).toEqual([]);
  });
});

describe("enableCommands()", () => {
  it("linux enables + starts the unit and enables linger", () => {
    const cmds = enableCommands("linux", "/home/u");
    expect(cmds).toContainEqual(["systemctl", "--user", "enable", "--now", "grindeasy"]);
    expect(cmds).toContainEqual(["loginctl", "enable-linger"]);
  });

  it("darwin bootstraps into the gui domain", () => {
    const cmds = enableCommands("darwin", "/Users/u");
    expect(cmds[0]![0]).toBe("launchctl");
    expect(cmds[0]![1]).toBe("bootstrap");
    expect(cmds[0]![3]).toBe("/Users/u/Library/LaunchAgents/tech.grindeasy.plist");
  });

  it("win32 writes an HKCU Run value pointing at the vbs via wscript", () => {
    const cmds = enableCommands("win32", "C:/Users/u");
    const [cmd, ...args] = cmds[0]!;
    expect(cmd).toBe("reg");
    expect(args[0]).toBe("add");
    expect(args).toContain("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    const data = args[args.indexOf("/d") + 1]!;
    expect(data).toMatch(/^wscript\.exe ".*supervise\.vbs"$/);
  });
});

describe("disableCommands()", () => {
  it("linux disables + stops the unit", () => {
    expect(disableCommands("linux", "/home/u")).toContainEqual([
      "systemctl",
      "--user",
      "disable",
      "--now",
      "grindeasy",
    ]);
  });

  it("darwin boots the agent out of the gui domain", () => {
    const cmds = disableCommands("darwin", "/Users/u");
    expect(cmds[0]![0]).toBe("launchctl");
    expect(cmds[0]![1]).toBe("bootout");
  });

  it("win32 removes the Run value", () => {
    const cmds = disableCommands("win32", "C:/Users/u");
    expect(cmds[0]!.slice(0, 3)).toEqual([
      "reg",
      "delete",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    ]);
  });
});

describe("renderSystemdUnit / renderSupervisorVbs", () => {
  it("the unit never gives up restarting", () => {
    const unit = renderSystemdUnit();
    expect(unit).toContain("StartLimitIntervalSec=0");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("Nice=10");
  });

  it("the supervisor backs off 10s between restarts", () => {
    expect(renderSupervisorVbs()).toContain("WScript.Sleep 10000");
  });
});

// ── isAgentRunning (the duplicate guard + verify probe) ──────────────────────

function snapshotFixture(over: Partial<Snapshot> = {}): Snapshot {
  return {
    tierName: "Gold",
    tierGlyph: "●",
    xp: 40,
    nextAtXp: 100,
    progressPct: 40,
    totalHours: 2.4,
    perTool: [],
    combos: 0,
    plan: "pro",
    planBadge: "PRO",
    streakDays: 1,
    activeNow: ["Claude Code"],
    achievements: [],
    sync: {
      status: "ok",
      lastSyncAt: "2026-07-11T16:44:25.141Z",
      lastError: null,
      rank: 3,
      totalPlayers: 128,
    },
    donateUrl: "https://example.com",
    generatedAt: "2026-07-11T16:44:25.141Z",
    ...over,
  };
}

describe("isAgentRunning()", () => {
  it("returns the parsed snapshot on a 200", async () => {
    const snap = snapshotFixture();
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify(snap), { status: 200 }),
    ) as unknown as typeof fetch;
    const got = await isAgentRunning(4599, fetchFn);
    expect(got?.sync?.rank).toBe(3);
  });

  it("returns null when nothing is listening (fetch throws)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await isAgentRunning(4599, fetchFn)).toBeNull();
  });

  it("returns null on a non-200", async () => {
    const fetchFn = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    expect(await isAgentRunning(4599, fetchFn)).toBeNull();
  });
});

describe("renderRunningStatus()", () => {
  it("shows rank out of the field when known", () => {
    expect(renderRunningStatus(snapshotFixture())).toContain("#3 of 128");
  });

  it("shows a dash for rank when sync is local-only", () => {
    const out = renderRunningStatus(snapshotFixture({ sync: null }));
    expect(out).toContain("Rank      —");
    expect(out).toContain("local only");
  });
});

// ── Lifecycle with an injected runner + fake home ────────────────────────────

describe("installService()", () => {
  let home: string;
  // Model the normal case: a login shell already resolves grindeasy, so install
  // never needs to shell out to `npm i -g`.
  const okRunner = vi.fn(async (_cmd: string, args: string[]): Promise<RunResult> => {
    if (args.includes("command -v grindeasy")) {
      return { code: 0, stdout: "/usr/local/bin/grindeasy\n", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  });

  function env(over: Partial<ServiceEnv> = {}): Partial<ServiceEnv> {
    return {
      home,
      platform: "linux",
      statsPort: 4599,
      run: okRunner,
      fetchFn: vi.fn(
        async () => new Response(JSON.stringify(snapshotFixture()), { status: 200 }),
      ) as unknown as typeof fetch,
      sleep: async () => {},
      log: () => {},
      spawnSupervisor: vi.fn(),
      ...over,
    };
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "grindeasy-svc-"));
    okRunner.mockClear();
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("writes the unit, runs enable, and verifies via the stats port", async () => {
    await installService(env());
    expect(existsSync(join(home, ".config/systemd/user/grindeasy.service"))).toBe(true);
    expect(okRunner).toHaveBeenCalled();
  });

  it("spawns the supervisor on win32 (Run key doesn't start it)", async () => {
    const spawnSupervisor = vi.fn();
    // Windows now ensures a durable binary too — the supervisor runs `cmd /c
    // grindeasy` from a clean env, so it probes with `where grindeasy` first.
    const winRunner = vi.fn(async (_cmd: string, args: string[]): Promise<RunResult> =>
      args.includes("where grindeasy")
        ? { code: 0, stdout: "C:\\Users\\u\\AppData\\Roaming\\npm\\grindeasy.cmd\r\n", stderr: "" }
        : { code: 0, stdout: "", stderr: "" },
    );
    await installService(env({ platform: "win32", spawnSupervisor, run: winRunner }));
    expect(spawnSupervisor).toHaveBeenCalledWith(home);
    // No global install needed when `where` already found a durable copy.
    expect(winRunner.mock.calls.filter(([cmd]) => cmd === "npm")).toHaveLength(0);
  });

  it("installs grindeasy globally on win32 when `where` finds only an npx copy", async () => {
    let installed = false;
    const winRunner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("where grindeasy")) {
        return installed
          ? { code: 0, stdout: "C:\\Users\\u\\AppData\\Roaming\\npm\\grindeasy.cmd\r\n", stderr: "" }
          : // `where` exits 0 but the only hit is the throwaway npx copy.
            {
              code: 0,
              stdout: "C:\\Users\\u\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\.bin\\grindeasy.cmd\r\n",
              stderr: "",
            };
      }
      if (cmd === "npm") {
        installed = true;
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });
    const spawnSupervisor = vi.fn();
    const ok = await installService(env({ platform: "win32", spawnSupervisor, run: winRunner }));
    expect(winRunner).toHaveBeenCalledWith("npm", expect.arrayContaining(["i", "-g"]));
    expect(ok).toBe(true);
    expect(spawnSupervisor).toHaveBeenCalledWith(home);
  });

  it("stays foreground on win32 when no durable binary can be installed", async () => {
    const winRunner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("where grindeasy")) return { code: 1, stdout: "", stderr: "" };
      if (cmd === "npm") return { code: 1, stdout: "", stderr: "offline" };
      return { code: 0, stdout: "", stderr: "" };
    });
    const spawnSupervisor = vi.fn();
    const ok = await installService(env({ platform: "win32", spawnSupervisor, run: winRunner }));
    expect(ok).toBe(false);
    expect(spawnSupervisor).not.toHaveBeenCalled();
  });

  it("cleans up the artifact when enable fails, leaving nothing half-installed", async () => {
    // Binary present (so we reach enable), but the enable step itself fails.
    const failRunner = vi.fn(async (_cmd: string, args: string[]): Promise<RunResult> =>
      args.includes("command -v grindeasy")
        ? { code: 0, stdout: "/usr/local/bin/grindeasy\n", stderr: "" }
        : { code: 1, stdout: "", stderr: "no systemd" },
    );
    await installService(env({ run: failRunner }));
    expect(existsSync(join(home, ".config/systemd/user/grindeasy.service"))).toBe(false);
  });

  it("does not reinstall when already installed", async () => {
    await installService(env());
    okRunner.mockClear();
    await installService(env());
    expect(okRunner).not.toHaveBeenCalled();
  });

  it("tolerates loginctl failing (linger is best-effort)", async () => {
    const runner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("command -v grindeasy")) {
        return { code: 0, stdout: "/usr/local/bin/grindeasy\n", stderr: "" };
      }
      return cmd === "loginctl"
        ? { code: 1, stdout: "", stderr: "no session" }
        : { code: 0, stdout: "", stderr: "" };
    });
    await installService(env({ run: runner }));
    expect(existsSync(join(home, ".config/systemd/user/grindeasy.service"))).toBe(true);
  });

  it("skips the global install when grindeasy already resolves on PATH", async () => {
    await installService(env());
    const npmCalls = okRunner.mock.calls.filter(([cmd]) => cmd === "npm");
    expect(npmCalls).toHaveLength(0);
  });

  it("installs grindeasy globally when a login shell can't find it, then writes the unit", async () => {
    let installed = false;
    const runner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("command -v grindeasy")) {
        return installed
          ? { code: 0, stdout: "/home/u/.local/bin/grindeasy\n", stderr: "" }
          : { code: 1, stdout: "", stderr: "" };
      }
      if (cmd === "npm") {
        installed = true;
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });
    const ok = await installService(env({ run: runner }));
    expect(runner).toHaveBeenCalledWith("npm", expect.arrayContaining(["i", "-g"]));
    expect(existsSync(join(home, ".config/systemd/user/grindeasy.service"))).toBe(true);
    expect(ok).toBe(true);
  });

  it("writes no unit and stays foreground when the global install fails", async () => {
    const runner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("command -v grindeasy")) return { code: 1, stdout: "", stderr: "" };
      if (cmd === "npm") return { code: 1, stdout: "", stderr: "network down" };
      return { code: 0, stdout: "", stderr: "" };
    });
    const ok = await installService(env({ run: runner }));
    expect(existsSync(join(home, ".config/systemd/user/grindeasy.service"))).toBe(false);
    expect(ok).toBe(false);
  });

  it("probes the login shell with npx's throwaway bin dir stripped from PATH", async () => {
    // The real npx failure: under `npx grindeasy`, npm prepends an _npx bin dir
    // holding a grindeasy symlink. A login shell inherits it and resolves there,
    // hiding the durable global install. The probe must strip _npx before asking.
    const npxBin = "/home/u/.npm/_npx/abc123/node_modules/.bin";
    const realBin = "/home/u/.local/opt/node/bin";
    const original = process.env.PATH;
    process.env.PATH = `${npxBin}:${realBin}:/usr/bin`;
    let probePath: string | undefined;
    const runner = vi.fn(
      async (_cmd: string, args: string[], opts?: RunOpts): Promise<RunResult> => {
        if (args.includes("command -v grindeasy")) {
          probePath = opts?.env?.PATH;
          return { code: 0, stdout: "/usr/local/bin/grindeasy\n", stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    );
    try {
      await installService(env({ run: runner }));
    } finally {
      process.env.PATH = original;
    }
    expect(probePath).toBeDefined();
    expect(probePath).not.toContain("_npx");
    expect(probePath).toContain(realBin);
  });

  it("treats an npx-cache path as not durable and installs a real one", async () => {
    let installed = false;
    const runner = vi.fn(async (cmd: string, args: string[]): Promise<RunResult> => {
      if (args.includes("command -v grindeasy")) {
        if (installed) return { code: 0, stdout: "/home/u/.local/bin/grindeasy\n", stderr: "" };
        // Resolves, but only to the throwaway npx copy — must not count as durable.
        return { code: 0, stdout: "/home/u/.npm/_npx/abc123/node_modules/.bin/grindeasy\n", stderr: "" };
      }
      if (cmd === "npm") {
        installed = true;
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });
    const ok = await installService(env({ run: runner }));
    expect(runner).toHaveBeenCalledWith("npm", expect.arrayContaining(["i", "-g"]));
    expect(ok).toBe(true);
  });
});

describe("uninstallService()", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "grindeasy-svc-"));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("removes the artifact and runs disable", async () => {
    const run = vi.fn(async (_cmd: string, args: string[]): Promise<RunResult> =>
      args.includes("command -v grindeasy")
        ? { code: 0, stdout: "/usr/local/bin/grindeasy\n", stderr: "" }
        : { code: 0, stdout: "", stderr: "" },
    );
    const base: Partial<ServiceEnv> = {
      home,
      platform: "linux",
      statsPort: 4599,
      run,
      fetchFn: vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
      sleep: async () => {},
      log: () => {},
      spawnSupervisor: vi.fn(),
    };
    await installService(base);
    expect(isInstalled("linux", home)).toBe(true);

    await uninstallService(base);
    expect(isInstalled("linux", home)).toBe(false);
    expect(run).toHaveBeenCalledWith("systemctl", ["--user", "disable", "--now", "grindeasy"]);
  });

  it("is a no-op when nothing is installed", async () => {
    const run = vi.fn(async (): Promise<RunResult> => ({ code: 0, stdout: "", stderr: "" }));
    await uninstallService({ home, platform: "linux", run, log: () => {} });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("serviceStatus()", () => {
  it("reports not-installed + not-running cleanly", async () => {
    const home = mkdtempSync(join(tmpdir(), "grindeasy-svc-"));
    const lines: string[] = [];
    await serviceStatus({
      home,
      platform: "linux",
      statsPort: 4599,
      fetchFn: vi.fn(async () => {
        throw new Error("down");
      }) as unknown as typeof fetch,
      log: (m) => lines.push(m),
    });
    expect(lines.join("\n")).toContain("not installed");
    expect(lines.join("\n")).toContain("not running");
    rmSync(home, { recursive: true, force: true });
  });
});
