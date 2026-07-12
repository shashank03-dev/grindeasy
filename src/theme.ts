/**
 * Terminal styling for the phosphor-green grindeasy brand.
 *
 * Every function is pure: it takes strings and returns strings, never touching
 * the console. That keeps the whole visual layer unit-testable — a test can
 * assert the exact escape sequence, or that none is emitted under NO_COLOR.
 *
 * Colours are the exact hexes the rest of the project uses (the local dashboard
 * in statsServer.ts, the Discord "ascent" mark). picocolors only speaks the 16
 * basic ANSI colours, so to land on #82d399 rather than a generic green we emit
 * 24-bit truecolor ourselves and let colorEnabled() gate it.
 */

/** The brand palette, from commit 42ae52c ("terminal-green theme"). */
export const PALETTE = {
  phosphor: "#82d399", // active / primary
  deep: "#4b8057", // echo / secondary
  border: "#2f5a3f", // panel border
  panel: "#1a211d", // subtle divider
  dim: "#838b87", // secondary text
  dimmer: "#5b6b60", // tertiary text
  fg: "#e3e7e4", // foreground
} as const;

/**
 * Whether to emit ANSI escapes at all. False when output is piped/redirected
 * (not a TTY) or when NO_COLOR is set to anything (https://no-color.org).
 * FORCE_COLOR overrides both, chiefly so tests and CI can exercise the coloured
 * path deterministically. This is the single gate every other helper consults.
 */
export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  return Boolean(process.stdout && process.stdout.isTTY);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Wrap text in a 24-bit foreground colour, or return it untouched when colour is off. */
export function color(hex: string, text: string): string {
  if (!colorEnabled()) return text;
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export const phosphor = (t: string): string => color(PALETTE.phosphor, t);
export const deep = (t: string): string => color(PALETTE.deep, t);
export const dim = (t: string): string => color(PALETTE.dim, t);
export const dimmer = (t: string): string => color(PALETTE.dimmer, t);
export const borderColor = (t: string): string => color(PALETTE.border, t);
export const fg = (t: string): string => color(PALETTE.fg, t);

export function bold(text: string): string {
  return colorEnabled() ? `\x1b[1m${text}\x1b[22m` : text;
}

/** Strip ANSI escapes so we can measure the *visible* width of a styled string. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}
export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Colour each character of a single line along a gradient from `fromHex` to
 * `toHex`. Used for the wordmark; degrades to plain text when colour is off.
 */
export function gradientLine(text: string, fromHex: string, toHex: string): string {
  if (!colorEnabled()) return text;
  const [r1, g1, b1] = hexToRgb(fromHex);
  const [r2, g2, b2] = hexToRgb(toHex);
  const chars = [...text];
  const denom = Math.max(1, chars.length - 1);
  return chars
    .map((ch, i) => {
      if (ch === " ") return ch;
      const t = i / denom;
      const r = lerp(r1, r2, t);
      const g = lerp(g1, g2, t);
      const b = lerp(b1, b2, t);
      return `\x1b[38;2;${r};${g};${b}m${ch}`;
    })
    .join("")
    .concat("\x1b[39m");
}

/**
 * The startup banner: the "ascent" mark (climbing chevrons — the Discord mark
 * rendered in text) beside the wordmark and tagline. The mark's rows run from
 * deep green at the base to phosphor at the peak, echoing "climbing a tier".
 */
export function banner(): string {
  const rows: Array<{ mark: string; markHex: string; text: string }> = [
    { mark: "   ╱╲   ", markHex: PALETTE.phosphor, text: "" },
    { mark: "  ╱  ╲  ", markHex: PALETTE.phosphor, text: bold(phosphor("grindeasy")) },
    { mark: " ╱ ╱╲ ╲ ", markHex: PALETTE.deep, text: borderColor("────────────") },
    { mark: "╱ ╱  ╲ ╲", markHex: PALETTE.deep, text: dim("track the climb") },
  ];
  const markWidth = Math.max(...rows.map((r) => r.mark.length));
  const lines = rows.map((r) => {
    const mark = color(r.markHex, r.mark.padEnd(markWidth));
    return `  ${mark}  ${r.text}`.trimEnd();
  });
  return "\n" + lines.join("\n") + "\n";
}

export interface PanelOptions {
  /** Extra spaces of horizontal padding inside the border. Default 1. */
  padding?: number;
}

/**
 * A bordered, padded panel (Lip-Gloss style) in border-green with a phosphor
 * title inset into the top edge. `lines` are pre-formatted, possibly-coloured
 * content rows; the box is sized to the widest visible row so colour codes never
 * throw off alignment.
 */
export function panel(title: string, lines: string[], opts: PanelOptions = {}): string {
  const pad = opts.padding ?? 1;
  const gap = " ".repeat(pad);
  const contentWidth = Math.max(
    visibleWidth(title) + 2,
    ...lines.map((l) => visibleWidth(l)),
    10,
  );
  const inner = contentWidth + pad * 2;

  const b = (s: string) => borderColor(s);
  const titleText = ` ${phosphor(title)} `;
  const titleFill = "─".repeat(Math.max(0, inner - visibleWidth(titleText) - 1));
  const top = b("╭─") + titleText + b(titleFill + "╮");
  const bottom = b("╰" + "─".repeat(inner) + "╯");

  const body = lines.map((l) => {
    const trailing = " ".repeat(Math.max(0, contentWidth - visibleWidth(l)));
    return b("│") + gap + l + trailing + gap + b("│");
  });

  return [top, ...body, bottom].join("\n");
}

/**
 * One aligned "marker  label  hint" row for use inside a panel. `label` is padded
 * to `labelWidth` so a column of rows lines up regardless of colour codes.
 */
export function row(marker: string, label: string, labelWidth: number, hint = ""): string {
  const padded = label + " ".repeat(Math.max(0, labelWidth - visibleWidth(label)));
  return `${marker} ${padded}${hint ? "  " + dim(hint) : ""}`.trimEnd();
}

/** Status glyphs, no emojis. Filled = active/tracked, hollow = present/available. */
export const MARK = {
  active: () => phosphor("●"),
  tracked: () => deep("●"),
  found: () => dimmer("○"),
  bullet: () => dim("·"),
} as const;
