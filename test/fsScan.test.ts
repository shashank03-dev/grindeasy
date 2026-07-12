import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newestMtimeMs } from "../src/fsScan.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "grindeasy-scan-"));
  mkdirSync(join(root, "nested", "deep"), { recursive: true });
  const write = (rel: string, mtimeSec: number) => {
    const p = join(root, rel);
    writeFileSync(p, "x");
    utimesSync(p, mtimeSec, mtimeSec);
  };
  write("old.jsonl", 1000);
  write("nested/new.jsonl", 5000);
  write("nested/deep/ignored.txt", 9000); // wrong extension
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("newestMtimeMs", () => {
  it("returns the newest matching file mtime, ignoring other extensions", async () => {
    const m = await newestMtimeMs([root], [".jsonl"]);
    expect(m).toBe(5000 * 1000); // seconds -> ms
  });

  it("returns null for a missing directory", async () => {
    const m = await newestMtimeMs([join(root, "does-not-exist")], [".jsonl"]);
    expect(m).toBeNull();
  });

  it("returns null when no extensions match", async () => {
    const m = await newestMtimeMs([root], [".foo"]);
    expect(m).toBeNull();
  });
});

/**
 * The Copilot case: one shared tree (VS Code's workspaceStorage) holding both AI
 * chat files and ordinary editor state. Only the chat files may count.
 */
describe("newestMtimeMs with pathIncludes", () => {
  let ws: string;

  beforeAll(() => {
    ws = mkdtempSync(join(tmpdir(), "grindeasy-ws-"));
    const write = (rel: string, mtimeSec: number) => {
      const p = join(ws, rel);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, "x");
      utimesSync(p, mtimeSec, mtimeSec);
    };
    // AI chat activity (older) vs plain editor state (newer).
    write("hash1/chatSessions/abc.json", 3000);
    write("hash1/state.json", 8000); // not chat — must be ignored
  });

  afterAll(() => rmSync(ws, { recursive: true, force: true }));

  it("counts only files under a matching path fragment", async () => {
    const m = await newestMtimeMs([ws], [".json"], { pathIncludes: ["chatsessions"] });
    // The newer state.json is excluded, so the chat file's mtime wins.
    expect(m).toBe(3000 * 1000);
  });

  it("without the filter, the unrelated editor file would win — proving the filter bites", async () => {
    const m = await newestMtimeMs([ws], [".json"]);
    expect(m).toBe(8000 * 1000);
  });

  it("returns null when nothing sits under the fragment", async () => {
    const m = await newestMtimeMs([ws], [".json"], { pathIncludes: ["no-such-dir"] });
    expect(m).toBeNull();
  });
});
