import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  coreTools,
  discoverExtended,
  extendedById,
  extendedTools,
  isPresent,
  trackedTools,
} from "../src/catalog.js";
import { detectTool } from "../src/tools.js";
import type { ToolDef } from "../src/types.js";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "grindeasy-catalog-"));
}

describe("isPresent", () => {
  it("is false when no activity directory exists", () => {
    const home = tmpHome();
    const [zed] = extendedTools(home);
    expect(zed && isPresent(zed)).toBe(false);
  });

  it("is true once any one of the activity directories exists", () => {
    const home = tmpHome();
    const zed = extendedTools(home).find((t) => t.id === "zed")!;
    // Create only the first activity dir; presence is an OR across all of them.
    mkdirSync(zed.activityDirs[0]!, { recursive: true });
    expect(isPresent(zed)).toBe(true);
  });

  it("does not count Copilot present just because VS Code (workspaceStorage) exists", () => {
    const home = tmpHome();
    // A VS Code user with no Copilot: workspaceStorage and a workspace exist, but
    // no chat directory. Copilot must not be offered.
    mkdirSync(join(home, ".config", "Code", "User", "workspaceStorage", "hash1"), {
      recursive: true,
    });
    const copilot = extendedById("copilot", home)!;
    expect(isPresent(copilot)).toBe(false);
  });

  it("counts Copilot present once a chat directory actually exists", () => {
    const home = tmpHome();
    mkdirSync(
      join(home, ".config", "Code", "User", "workspaceStorage", "hash1", "chatSessions"),
      { recursive: true },
    );
    const copilot = extendedById("copilot", home)!;
    expect(isPresent(copilot)).toBe(true);
  });
});

describe("discoverExtended", () => {
  it("returns nothing on a machine with none of the extended tools", () => {
    expect(discoverExtended(tmpHome())).toEqual([]);
  });

  it("returns only the extended tools actually present on disk", () => {
    const home = tmpHome();
    const continueDir = extendedTools(home).find((t) => t.id === "continue")!.activityDirs[0]!;
    mkdirSync(continueDir, { recursive: true });

    const found = discoverExtended(home);
    expect(found.map((t) => t.id)).toEqual(["continue"]);
  });

  it("never surfaces a core tool — the two catalogs are disjoint", () => {
    const home = tmpHome();
    const coreIds = new Set(coreTools(home).map((t) => t.id));
    for (const ext of extendedTools(home)) {
      expect(coreIds.has(ext.id)).toBe(false);
    }
  });
});

describe("Claude Desktop detection", () => {
  const claudeCode = (home: string): ToolDef =>
    coreTools(home).find((t) => t.id === "claude-code")!;

  it("watches both the CLI transcript dir and the desktop session dir", () => {
    const home = tmpHome();
    const dirs = claudeCode(home).activityDirs;
    expect(dirs).toContain(join(home, ".claude", "projects"));
    expect(dirs).toContain(join(home, ".config", "Claude", "claude-code-sessions"));
    // The desktop app writes local_*.json, so .json must be an activity ext.
    expect(claudeCode(home).extensions).toContain(".json");
  });

  it("reports active when a recent session file lands in the desktop dir", async () => {
    const home = tmpHome();
    // Mirror the real layout: …/claude-code-sessions/<uuid>/<uuid>/local_*.json
    const sessionDir = join(home, ".config", "Claude", "claude-code-sessions", "s1", "t1");
    mkdirSync(sessionDir, { recursive: true });
    const file = join(sessionDir, "local_abc.json");
    writeFileSync(file, "{}", "utf8");
    const now = 1_000_000_000_000;
    utimesSync(file, new Date(now), new Date(now)); // fresh mtime

    const activity = await detectTool(claudeCode(home), 60_000, now + 5_000);
    expect(activity.active).toBe(true);
  });
});

describe("IDE assistants", () => {
  const ext = (home: string, id: string): ToolDef => extendedById(id, home)!;

  it("watches each Cline-family assistant's own globalStorage directory", () => {
    const home = tmpHome();
    expect(ext(home, "cline").activityDirs).toContain(
      join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev"),
    );
    expect(ext(home, "kilo-code").activityDirs).toContain(
      join(home, ".config", "Code", "User", "globalStorage", "kilocode.kilo-code"),
    );
  });

  it("credits Copilot for chat activity but not for plain VS Code editing", async () => {
    const home = tmpHome();
    const ws = join(home, ".config", "Code", "User", "workspaceStorage", "hash1");
    mkdirSync(join(ws, "chatSessions"), { recursive: true });
    const now = 1_000_000_000_000;

    // Plain editor state, freshly written: must NOT make Copilot active.
    const state = join(ws, "state.json");
    writeFileSync(state, "{}", "utf8");
    utimesSync(state, new Date(now), new Date(now));

    const copilot = ext(home, "copilot");
    expect((await detectTool(copilot, 60_000, now + 5_000)).active).toBe(false);

    // Now an actual Copilot chat file lands — that does count.
    const chat = join(ws, "chatSessions", "session.json");
    writeFileSync(chat, "{}", "utf8");
    utimesSync(chat, new Date(now), new Date(now));

    expect((await detectTool(copilot, 60_000, now + 5_000)).active).toBe(true);
  });
});

describe("extendedById", () => {
  it("looks up a known extended tool and misses on an unknown id", () => {
    const home = tmpHome();
    expect(extendedById("zed", home)?.name).toBe("Zed");
    expect(extendedById("no-such-tool", home)).toBeUndefined();
  });
});

describe("trackedTools", () => {
  const home = tmpHome();
  const custom: ToolDef = {
    id: "my-editor",
    name: "My Editor",
    activityDirs: ["/tmp/does-not-matter"],
    extensions: [".json"],
  };

  it("tracks every core tool with nothing enabled", () => {
    const ids = trackedTools([], [], home).map((t) => t.id);
    expect(ids).toEqual(coreTools(home).map((t) => t.id));
  });

  it("adds an enabled extended tool on top of the core set", () => {
    const ids = trackedTools(["continue"], [], home).map((t) => t.id);
    expect(ids).toContain("continue");
    expect(ids.filter((id) => id === "continue")).toHaveLength(1);
  });

  it("ignores an enabled id that isn't in the extended catalog", () => {
    const ids = trackedTools(["ghost-tool"], [], home).map((t) => t.id);
    expect(ids).toEqual(coreTools(home).map((t) => t.id));
  });

  it("appends custom tools", () => {
    const tools = trackedTools([], [custom], home);
    expect(tools.map((t) => t.id)).toContain("my-editor");
  });

  it("lets a custom tool override a built-in with the same id", () => {
    const override: ToolDef = { ...custom, id: "claude-code", activityDirs: ["/custom/path"] };
    const tools = trackedTools([], [override], home);
    const claude = tools.filter((t) => t.id === "claude-code");
    expect(claude).toHaveLength(1);
    expect(claude[0]?.activityDirs).toEqual(["/custom/path"]);
  });
});
