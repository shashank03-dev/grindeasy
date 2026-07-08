import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Return the newest modification time (ms since epoch) among files under any of
 * `roots` whose name ends in one of `extensions`. Returns null when nothing
 * matches (dir missing, empty, or no matching files).
 *
 * Only file metadata (mtime) is read — never file contents. Scanning is depth
 * limited so a pathological tree can't stall the poll loop.
 */
export async function newestMtimeMs(
  roots: string[],
  extensions: string[],
  maxDepth = 6,
): Promise<number | null> {
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
