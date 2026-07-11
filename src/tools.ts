import { homedir } from "node:os";
import { join } from "node:path";
import { newestMtimeMs } from "./fsScan.js";
import type { ToolActivity, ToolDef } from "./types.js";

/**
 * Built-in tool definitions. Activity is detected from each tool's own session
 * log directory — the newest file mtime tells us the tool is being used right
 * now, without ever reading what's in those files.
 */
export function defaultTools(home = homedir()): ToolDef[] {
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      activityDirs: [join(home, ".claude", "projects")],
      extensions: [".jsonl"],
    },
    {
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
    // any of them can be overridden via `tools` in ~/.grindboard/config.json.
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
 * Detect whether a single tool is active: its newest activity file was modified
 * within `activeWindowMs` of `now`.
 */
export async function detectTool(
  tool: ToolDef,
  activeWindowMs: number,
  now: number = Date.now(),
): Promise<ToolActivity> {
  const newest = await newestMtimeMs(tool.activityDirs, tool.extensions);
  const ageMs = newest === null ? null : Math.max(0, now - newest);
  const active = ageMs !== null && ageMs <= activeWindowMs;
  return { id: tool.id, name: tool.name, active, ageMs };
}

/** Detect all tools in parallel. */
export function detectAll(
  tools: ToolDef[],
  activeWindowMs: number,
  now: number = Date.now(),
): Promise<ToolActivity[]> {
  return Promise.all(tools.map((t) => detectTool(t, activeWindowMs, now)));
}
