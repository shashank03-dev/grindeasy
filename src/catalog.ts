import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "./types.js";

/**
 * The tool catalog, split in two.
 *
 * CORE tools are always tracked — they are the original set, and an absent one
 * simply never shows active, so tracking it costs nothing. EXTENDED tools are
 * probed for on disk and only tracked once the user opts in (see config's
 * enabledToolIds), because the catalog is large and a card listing twenty tools
 * would be noise.
 *
 * Detection is always newest-file-mtime under `activityDirs` — never file
 * contents (see types.ts / fsScan.ts). `activityDirs` doubles as the presence
 * signal: if one exists, the tool has been used and is worth offering.
 */

/** The original six. Always tracked; behaviour is unchanged from before the catalog split. */
export function coreTools(home = homedir()): ToolDef[] {
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      // The CLI writes transcripts to ~/.claude/projects/**/*.jsonl. The Claude
      // *desktop* app is a separate install that keeps its coding sessions under
      // its Electron userData dir (…/Claude/claude-code-sessions/**/local_*.json),
      // so both paths are watched under the one "Claude Code" entry — the card
      // shows a single line whether you code in the terminal or the desktop app.
      // Desktop userData location is verified on Linux; the mac/Windows paths
      // follow Electron's convention and are best-effort (a wrong one just never
      // matches). ".json" is added for the desktop sessions; under ~/.claude it
      // only ever matches files Claude Code itself writes, so it stays accurate.
      activityDirs: [
        join(home, ".claude", "projects"),
        join(home, ".config", "Claude", "claude-code-sessions"), // Linux
        join(home, "Library", "Application Support", "Claude", "claude-code-sessions"), // macOS
        join(home, "AppData", "Roaming", "Claude", "claude-code-sessions"), // Windows
      ],
      extensions: [".jsonl", ".json"],
    },
    {
      // Codex covers both the CLI and its desktop/app-server mode: both write
      // rollout-*.jsonl under ~/.codex/sessions/<date>/ (the scanner recurses),
      // plus a top-level ~/.codex/history.jsonl, so no separate desktop entry is
      // needed.
      id: "codex",
      name: "Codex",
      activityDirs: [join(home, ".codex", "sessions"), join(home, ".codex")],
      extensions: [".jsonl", ".json"],
    },
    {
      id: "opencode",
      name: "OpenCode",
      activityDirs: [
        join(home, ".local", "share", "opencode"),
        join(home, ".opencode"),
      ],
      extensions: [".json", ".jsonl", ".log"],
    },
    // The three below are best-effort: session dir layouts vary by version and
    // platform. A wrong path is harmless (the tool just never shows active) and
    // any of them can be overridden via customTools in ~/.grindeasy/config.json.
    {
      id: "cursor",
      name: "Cursor",
      activityDirs: [join(home, ".cursor", "chats"), join(home, ".cursor", "cli")],
      extensions: [".json", ".jsonl", ".md"],
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      activityDirs: [join(home, ".gemini", "tmp")],
      extensions: [".json", ".log"],
    },
    {
      id: "aider",
      name: "Aider",
      activityDirs: [join(home, ".aider")],
      extensions: [".json", ".jsonl", ".md"],
    },
  ];
}

/**
 * VS Code's userData roots (stable + Insiders) for every platform. Only the
 * host OS's paths will exist; the rest simply never match, which is how the
 * catalog stays a single cross-platform list.
 *
 * Extensions live under `<userData>/globalStorage/<publisher.extension>/` and
 * per-workspace state under `<userData>/workspaceStorage/<hash>/` — the two
 * shapes the IDE entries below key off.
 */
function vscodeUserDataDirs(home: string): string[] {
  return [
    join(home, ".config", "Code", "User"), // Linux
    join(home, ".config", "Code - Insiders", "User"),
    join(home, "Library", "Application Support", "Code", "User"), // macOS
    join(home, "Library", "Application Support", "Code - Insiders", "User"),
    join(home, "AppData", "Roaming", "Code", "User"), // Windows
    join(home, "AppData", "Roaming", "Code - Insiders", "User"),
  ];
}

/** An extension's dedicated globalStorage dir across every VS Code install. */
function globalStorageDirs(home: string, extensionId: string): string[] {
  return vscodeUserDataDirs(home).map((base) => join(base, "globalStorage", extensionId));
}

/**
 * Extended catalog: tools probed for on disk and offered to the user.
 *
 * Ships only tools whose session/activity directory is documented, so an enabled
 * tool actually credits time. Paths verified 2026-07:
 *   - Zed      ~/.local/share/zed/threads (agent history; threads.db + WAL),
 *              legacy ~/.config/zed/conversations. The .db-wal file's mtime
 *              updates on every write, which is the freshest activity signal.
 *   - Continue ~/.continue/sessions/*.json, plus ~/.continue/logs/*.log.
 *   - Windsurf ~/.codeium/windsurf — best-effort like the core "best-effort"
 *              trio above; presence is reliable, the exact log layout is not.
 *
 * The IDE assistants below are VS Code extensions. The Cline family each own a
 * globalStorage directory (tasks/<id>/*.json written as the agent works), so a
 * plain directory watch is exact. GitHub Copilot is the odd one out: its chat is
 * stored per-workspace under workspaceStorage/<hash>/chatSessions/, with no single
 * folder to watch — hence `pathIncludes`, which narrows the scan to the chat files
 * so merely having VS Code open never counts as AI activity.
 *
 * Extension ids verified against the VS Code Marketplace (2026-07):
 * saoudrizwan.claude-dev (Cline), rooveterinaryinc.roo-cline (Roo Code),
 * kilocode.kilo-code (Kilo Code — Roo's active successor).
 */
export function extendedTools(home = homedir()): ToolDef[] {
  return [
    {
      id: "zed",
      name: "Zed",
      activityDirs: [
        join(home, ".local", "share", "zed", "threads"),
        join(home, ".local", "share", "zed", "conversations"),
        join(home, ".config", "zed", "conversations"),
      ],
      extensions: [".db-wal", ".db", ".json"],
    },
    {
      id: "continue",
      name: "Continue",
      activityDirs: [join(home, ".continue", "sessions"), join(home, ".continue", "logs")],
      extensions: [".json", ".log"],
    },
    {
      id: "windsurf",
      name: "Windsurf",
      activityDirs: [join(home, ".codeium", "windsurf")],
      extensions: [".json", ".jsonl", ".log"],
    },
    {
      // Copilot Chat writes each conversation to workspaceStorage/<hash>/chatSessions/
      // and its edit sessions to .../chatEditingSessions/. Watching workspaceStorage
      // alone would fire on any VS Code activity, so pathIncludes restricts the scan
      // to those chat files — hand-editing with no AI never registers.
      //
      // pathIncludes also sharpens presence (see isPresent): because the
      // workspaceStorage root exists for anyone with VS Code, Copilot is offered
      // only once one of those chat directories actually exists, so a VS Code user
      // who has never touched Copilot is not shown a tool they don't have.
      id: "copilot",
      name: "GitHub Copilot",
      activityDirs: vscodeUserDataDirs(home).map((base) => join(base, "workspaceStorage")),
      extensions: [".json"],
      pathIncludes: ["chatsessions", "chateditingsessions"],
    },
    {
      id: "cline",
      name: "Cline",
      activityDirs: globalStorageDirs(home, "saoudrizwan.claude-dev"),
      extensions: [".json"],
    },
    {
      id: "roo-code",
      name: "Roo Code",
      activityDirs: globalStorageDirs(home, "rooveterinaryinc.roo-cline"),
      extensions: [".json"],
    },
    {
      id: "kilo-code",
      name: "Kilo Code",
      activityDirs: globalStorageDirs(home, "kilocode.kilo-code"),
      extensions: [".json"],
    },
  ];
}

/**
 * Depth we descend under an activity root looking for a directory named by
 * `pathIncludes`. Copilot's chat dirs sit at workspaceStorage/<hash>/chatSessions,
 * two levels down; a little slack costs nothing since this runs once at onboarding.
 */
const PRESENCE_MAX_DEPTH = 2;

/**
 * Whether some directory whose name matches one of `fragments` (case-insensitive)
 * exists at most `PRESENCE_MAX_DEPTH` levels below `root`. Directory names only —
 * never file contents. Returns on the first match.
 */
function hasNamedSubdir(root: string, fragments: string[], depth = 0): boolean {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return false; // missing/unreadable — not present
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (fragments.some((frag) => entry.name.toLowerCase().includes(frag))) return true;
    if (depth + 1 <= PRESENCE_MAX_DEPTH && hasNamedSubdir(join(root, entry.name), fragments, depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the tool's own data is present on this machine.
 *
 * For tools that own their activity directory outright, that directory merely
 * existing is proof. When `pathIncludes` is set the directory is shared with the
 * host editor (Copilot lives inside VS Code's workspaceStorage, which exists for
 * anyone with VS Code), so mere existence would false-positive — presence then
 * additionally requires a subdirectory named by one of the fragments, i.e. real
 * chat data. Presence only — never reads file contents.
 */
export function isPresent(tool: ToolDef): boolean {
  const fragments = tool.pathIncludes?.map((f) => f.toLowerCase());
  if (fragments && fragments.length > 0) {
    return tool.activityDirs.some((dir) => hasNamedSubdir(dir, fragments));
  }
  return tool.activityDirs.some((dir) => {
    try {
      return existsSync(dir);
    } catch {
      return false;
    }
  });
}

/** Extended-catalog tools whose directory currently exists on this machine. */
export function discoverExtended(home = homedir()): ToolDef[] {
  return extendedTools(home).filter(isPresent);
}

/** Look up an extended tool by id. */
export function extendedById(id: string, home = homedir()): ToolDef | undefined {
  return extendedTools(home).find((t) => t.id === id);
}

/**
 * The full set of tools to detect on each tick:
 *   core (always) + enabled extended + user custom tools.
 * Custom tools with an id colliding with a catalog id win, so a user override
 * of a built-in path takes effect.
 */
export function trackedTools(
  enabledToolIds: string[],
  customTools: ToolDef[],
  home = homedir(),
): ToolDef[] {
  const enabledExtended = extendedTools(home).filter((t) => enabledToolIds.includes(t.id));
  const merged = new Map<string, ToolDef>();
  for (const t of [...coreTools(home), ...enabledExtended, ...customTools]) {
    merged.set(t.id, t);
  }
  return [...merged.values()];
}
