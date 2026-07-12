import { newestMtimeMs } from "./fsScan.js";
import type { ToolActivity, ToolDef } from "./types.js";

/**
 * Tool detection engine. The catalog of *which* tools exist and where their
 * activity lives is in catalog.ts; this module only answers "is a given tool
 * active right now?" from the newest file mtime under its directories — never
 * from file contents.
 *
 * Detect whether a single tool is active: its newest activity file was modified
 * within `activeWindowMs` of `now`.
 */
export async function detectTool(
  tool: ToolDef,
  activeWindowMs: number,
  now: number = Date.now(),
): Promise<ToolActivity> {
  const newest = await newestMtimeMs(tool.activityDirs, tool.extensions, {
    pathIncludes: tool.pathIncludes,
  });
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
