import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ScanOptions {
  /** How deep to walk below each root. Guards against a pathological tree. */
  maxDepth?: number;
  /**
   * When set, a file only counts if its full path contains one of these
   * fragments (case-insensitive). Lets one tool be detected inside a tree shared
   * by many — e.g. only `…/chatSessions/*.json` under VS Code's workspaceStorage,
   * so plain editing never registers as AI activity.
   */
  pathIncludes?: string[];
}

/**
 * Return the newest modification time (ms since epoch) among files under any of
 * `roots` whose name ends in one of `extensions` (and, if `pathIncludes` is set,
 * whose path also contains one of those fragments). Returns null when nothing
 * matches (dir missing, empty, or no matching files).
 *
 * Only file metadata (mtime) is read — never file contents. Scanning is depth
 * limited so a pathological tree can't stall the poll loop.
 */
export async function newestMtimeMs(
  roots: string[],
  extensions: string[],
  opts: ScanOptions = {},
): Promise<number | null> {
  const maxDepth = opts.maxDepth ?? 6;
  const includes = (opts.pathIncludes ?? []).map((p) => p.toLowerCase());
  let newest: number | null = null;
  const exts = extensions.map((e) => e.toLowerCase());

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // missing/unreadable dir — treat as no activity
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (!exts.some((ext) => lower.endsWith(ext))) continue;
        if (includes.length > 0) {
          const fullLower = full.toLowerCase();
          if (!includes.some((frag) => fullLower.includes(frag))) continue;
        }
        try {
          const s = await stat(full);
          const m = s.mtimeMs;
          if (newest === null || m > newest) newest = m;
        } catch {
          // file vanished between readdir and stat — ignore
        }
      }
    }
  }

  await Promise.all(roots.map((root) => walk(root, 0)));
  return newest;
}
