import { tierHex } from "@/lib/tier-colors";

/**
 * Tier as data: glyph and name in the tier's own color, set in the mono data
 * voice so a column of them reads as values rather than decoration.
 */
export function TierBadge({ name, glyph }: { name: string; glyph: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[12.5px] tracking-[0.02em]"
      style={{ color: tierHex(name) }}
    >
      <span aria-hidden className="text-[11px]">
        {glyph}
      </span>
      {name}
    </span>
  );
}

/**
 * Plan is context, never a score multiplier. It is rendered as the quietest
 * thing on the row so the board never looks like it rewards spend.
 */
export function PlanBadge({ badge }: { badge: string }) {
  if (badge === "—") {
    return <span className="font-mono text-xs text-muted-foreground/50">—</span>;
  }
  return (
    <span className="border border-line px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground">
      {badge}
    </span>
  );
}
