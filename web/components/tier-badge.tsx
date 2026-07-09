import { cn } from "@/lib/utils";

/**
 * Tier colors are *data* colors, not brand accents: five categorical values on a
 * metallic ramp. They deliberately avoid the interface accent (green), which is
 * reserved for interactive state.
 */
const TIER_STYLES: Record<string, string> = {
  Bronze: "text-[oklch(0.68_0.09_55)]",
  Silver: "text-[oklch(0.80_0.01_260)]",
  Gold: "text-[oklch(0.82_0.14_90)]",
  Platinum: "text-[oklch(0.88_0.03_200)]",
  Diamond: "text-[oklch(0.86_0.10_195)]",
};

export function TierBadge({ name, glyph }: { name: string; glyph: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", TIER_STYLES[name])}>
      <span aria-hidden className="text-xs">
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
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }
  return (
    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">
      {badge}
    </span>
  );
}
