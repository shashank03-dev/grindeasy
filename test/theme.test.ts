import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  banner,
  color,
  colorEnabled,
  panel,
  PALETTE,
  row,
  stripAnsi,
  visibleWidth,
} from "../src/theme.js";

/**
 * theme.ts reads process.env and process.stdout.isTTY at call time, so each test
 * sets the environment it needs and restores it afterwards. FORCE_COLOR forces
 * the coloured path on regardless of TTY; NO_COLOR forces it off.
 */
const saved = { FORCE_COLOR: process.env.FORCE_COLOR, NO_COLOR: process.env.NO_COLOR };

beforeEach(() => {
  delete process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
});
afterEach(() => {
  restore("FORCE_COLOR", saved.FORCE_COLOR);
  restore("NO_COLOR", saved.NO_COLOR);
});
function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("colorEnabled", () => {
  it("is off when NO_COLOR is set, whatever the terminal is", () => {
    process.env.NO_COLOR = "1";
    expect(colorEnabled()).toBe(false);
  });

  it("is on when FORCE_COLOR is set, even with no TTY", () => {
    process.env.FORCE_COLOR = "1";
    expect(colorEnabled()).toBe(true);
  });

  it("lets FORCE_COLOR win over NO_COLOR", () => {
    process.env.FORCE_COLOR = "1";
    process.env.NO_COLOR = "1";
    expect(colorEnabled()).toBe(true);
  });

  it("treats FORCE_COLOR=0 as not forcing", () => {
    process.env.FORCE_COLOR = "0";
    process.env.NO_COLOR = "1";
    expect(colorEnabled()).toBe(false);
  });
});

describe("color", () => {
  it("emits the exact 24-bit sequence for the brand phosphor", () => {
    process.env.FORCE_COLOR = "1";
    // #82d399 -> 130,211,153. Every helper routes through this, so the whole
    // brand hinges on this one assertion.
    expect(color(PALETTE.phosphor, "x")).toBe("\x1b[38;2;130;211;153mx\x1b[39m");
  });

  it("returns the text untouched — no escapes at all — under NO_COLOR", () => {
    process.env.NO_COLOR = "1";
    const out = color(PALETTE.phosphor, "x");
    expect(out).toBe("x");
    expect(out).not.toContain("\x1b[");
  });
});

describe("visibleWidth / stripAnsi", () => {
  it("measures the visible text, ignoring colour codes", () => {
    process.env.FORCE_COLOR = "1";
    const styled = color(PALETTE.phosphor, "hello");
    expect(stripAnsi(styled)).toBe("hello");
    expect(visibleWidth(styled)).toBe(5);
  });
});

describe("panel", () => {
  it("draws a rounded, aligned box whose rows share one visible width", () => {
    process.env.NO_COLOR = "1"; // plain text, so widths are trivial to assert
    const out = panel("title", ["short", "a much longer line"]);
    const lines = out.split("\n");
    // top + 2 body + bottom
    expect(lines).toHaveLength(4);
    expect(lines[0]?.startsWith("╭─ title")).toBe(true);
    expect(lines[3]?.startsWith("╰")).toBe(true);
    // Every rendered line is the same visible width — the point of the box.
    const widths = new Set(lines.map((l) => visibleWidth(l)));
    expect(widths.size).toBe(1);
  });

  it("stays aligned when rows carry colour codes", () => {
    process.env.FORCE_COLOR = "1";
    const out = panel("t", [color(PALETTE.phosphor, "abc"), "abcdef"]);
    const widths = new Set(out.split("\n").map((l) => visibleWidth(l)));
    expect(widths.size).toBe(1);
  });
});

describe("row", () => {
  it("pads the label to a fixed column so a stack of rows lines up", () => {
    process.env.NO_COLOR = "1";
    const a = row("*", "ab", 10, "hint");
    const b = row("*", "abcdefgh", 10, "hint");
    const hintCol = (s: string) => s.indexOf("hint");
    expect(hintCol(a)).toBe(hintCol(b));
  });
});

describe("banner", () => {
  it("renders plain, escape-free art under NO_COLOR", () => {
    process.env.NO_COLOR = "1";
    const out = banner();
    expect(out).toContain("grindeasy");
    expect(out).not.toContain("\x1b[");
  });
});
