import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newestMtimeMs } from "../src/fsScan.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "viberank-scan-"));
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
