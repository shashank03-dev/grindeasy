import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type Config } from "../src/config.js";
import { needsOnboarding } from "../src/onboarding.js";

/**
 * needsOnboarding decides whether a run opens with the setup ceremony. Getting it
 * wrong is user-visible in the worst way: a false positive means the banner and
 * the "tools" panel greet a daily user on every single run.
 */

const savedTty = process.stdin.isTTY;
beforeEach(() => {
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
});
afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", { value: savedTty, configurable: true });
});

/** A $HOME with no AI tools and no installed service — nothing to discover. */
function emptyHome(): string {
  return mkdtempSync(join(tmpdir(), "grindeasy-onboard-"));
}

function config(over: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...over };
}

describe("needsOnboarding", () => {
  it("never runs without a TTY — the background service must not block on a prompt", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    expect(needsOnboarding(config(), emptyHome())).toBe(false);
  });

  it("runs on a fresh install, where the leaderboard has never been offered", () => {
    expect(needsOnboarding(config(), emptyHome())).toBe(true);
  });

  it("runs when a paired user has never been offered the background service", () => {
    expect(needsOnboarding(config({ accountToken: "t", askedToJoinBoard: true }), emptyHome())).toBe(
      true,
    );
  });

  it("stays quiet once the user declined the board — the service offer follows a pairing", () => {
    // Without a token there is nothing left to ask: offerServiceInstall only runs
    // after a successful pairing. Reporting "pending" here would re-open the setup
    // ceremony on every run and never resolve, because nothing would answer it.
    const declined = config({ askedToJoinBoard: true, accountToken: "" });
    expect(needsOnboarding(declined, emptyHome())).toBe(false);
  });

  it("stays quiet once every question has been answered", () => {
    const settled = config({
      accountToken: "t",
      askedToJoinBoard: true,
      askedToInstallService: true,
    });
    expect(needsOnboarding(settled, emptyHome())).toBe(false);
  });
});
