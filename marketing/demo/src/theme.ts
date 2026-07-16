// grindeasy brand palette — the exact hexes from the CLI (src/theme.ts) and the
// dashboard. The demo recreates the terminal, so it uses the same colors.
export const PALETTE = {
  phosphor: "#82d399", // active / primary
  deep: "#4b8057", // echo / secondary
  border: "#2f5a3f", // panel border
  panel: "#1a211d", // subtle divider
  dim: "#838b87", // secondary text
  dimmer: "#5b6b60", // tertiary text
  fg: "#e3e7e4", // foreground
  bg: "#0d100e", // terminal background
} as const;

// Monospace stack that resolves without a network fetch, so headless rendering is
// deterministic. DejaVu Sans Mono ships with the render environment and covers the
// box-drawing and geometric glyphs the terminal uses.
export const MONO =
  "'DejaVu Sans Mono', 'Menlo', 'Consolas', ui-monospace, monospace";

export type Line = {
  text: string;
  color?: string;
  bold?: boolean;
};
