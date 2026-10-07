"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlanBadge } from "@/components/tier-badge";
import type { UserCardData } from "@/lib/core/user-card";
import { toolLabel } from "@/lib/core/tool-labels";
import { tierHex } from "@/lib/tier-colors";
import { cn } from "@/lib/utils";

function formatHours(hours: number): string {
  if (hours <= 0) return "0m";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

/**
 * The signed-in personal dashboard, rendered inside the dropdown panel. Frosted
 * glass tinted to the user's tier. All values are derived upstream in
 * buildUserCard / buildWeeklyUserCard; this component only presents them.
 */
export function UserCard({ data }: { data: UserCardData }) {
  // On the weekly card, everPaired is lifetime-based so an idle-this-week user
  // still gets the (zeroed) weekly view; the all-time card leaves it undefined
  // and we fall back to a has-activity check.
  const paired = data.everPaired ?? (data.perTool.length > 0 || data.hours > 0);
  const accent = tierHex(data.tierName, "var(--signal)");

  return (
    <div
      className="glass-panel w-[21rem] overflow-hidden border p-5 shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)]"
      style={{
        // Border and glow lean on the tier accent; --tier also feeds the glass
        // gradient in globals.css.
        ["--tier" as string]: accent,
        borderColor: `color-mix(in oklch, ${accent} 32%, transparent)`,
      }}
    >
      <header className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-11 w-11 rounded-none after:rounded-none">
            {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt="" className="rounded-none" /> : null}
            <AvatarFallback className="rounded-none bg-secondary font-mono text-sm text-muted-foreground">
              {data.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* Online dot: lit and gently pulsing while a tool is actively running. */}
          {data.isOnline ? (
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center bg-card">
              <span className="pulse" />
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium tracking-[-0.005em] text-foreground">
            {data.username}
          </p>
          <p className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span style={{ color: accent }}>
              <span aria-hidden className="mr-1 text-[10px]">
                {data.tierGlyph}
              </span>
              {data.tierName}
            </span>
            <PlanBadge badge={data.planBadge} />
          </p>
        </div>

        {data.rank !== null ? (
          <p className="shrink-0 text-right">
            <span className="font-pixel text-[22px] leading-none tabular-nums text-foreground">
              #{data.rank}
            </span>
            {data.totalPlayers ? (
              <span className="label mt-1 block text-[10px] text-muted-foreground/70">
                of {data.totalPlayers}
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      {paired ? (
        <>
          {/* Next-tier progress. Its label states exactly what earns the jump. */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="tabular-nums text-foreground">{data.xp.toFixed(1)} XP</span>
              <span className="text-muted-foreground">
                {data.xpToNext !== null
                  ? `${data.xpToNext.toFixed(1)} to next tier`
                  : "Top tier reached"}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-secondary">
              <div
                className="h-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${data.nextTierProgressPct}%`,
                  background: `linear-gradient(90deg, color-mix(in oklch, ${accent} 70%, transparent), ${accent})`,
                }}
              />
            </div>
          </div>

          {/* Weekly view only: a 7-bar Mon→Sun histogram of daily active time.
              Its presence is also what marks the numbers below as this week's. */}
          {data.histogram ? (
            <div className="mt-5">
              <p className="label text-[10px] text-muted-foreground/70">
                This week
              </p>
              <Histogram bars={data.histogram} accent={accent} />
            </div>
          ) : null}

          {/* Two headline numbers: active hours (the product's unit) and combos. */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Active" value={formatHours(data.hours)} />
            <Stat label="Combos" value={String(data.combos)} />
          </div>

          {/* Per-tool breakdown, biggest first; anything running now is lit. */}
          <div className="mt-5 space-y-2">
            <p className="label text-[10px] text-muted-foreground/70">
              By tool
            </p>
            {data.perTool.map((tool) => {
              const live = data.activeTools.includes(tool.id);
              return (
                <div key={tool.id} className="flex items-center justify-between font-mono text-[12.5px]">
                  <span className="flex items-center gap-2 text-foreground">
                    {live ? (
                      <span
                        aria-label="running now"
                        className="h-1.5 w-1.5 bg-primary"
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 bg-border" />
                    )}
                    <span className={cn(live && "text-primary")}>{toolLabel(tool.id)}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatHours(tool.hours)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        // Signed in but no agent has ever synced — tell them exactly how to start.
        <div className="mt-5 border border-dashed border-input px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No agent paired yet.</p>
          <p className="mx-auto mt-2 text-xs leading-relaxed text-muted-foreground">
            Run <code className="text-primary">npx grindeasy</code> in a terminal, then{" "}
            <code className="text-primary">grindeasy login</code> to start counting active time.
          </p>
        </div>
      )}

      <a
        href="/logout"
        className="label mt-5 block border border-border py-2.5 text-center text-muted-foreground transition-colors hover:border-signal hover:text-foreground"
      >
        Log out
      </a>
    </div>
  );
}

function Histogram({
  bars,
  accent,
}: {
  bars: { label: string; hours: number }[];
  accent: string;
}) {
  const max = Math.max(...bars.map((b) => b.hours), 0);
  return (
    <div className="mt-2">
      <div className="flex h-11 items-end gap-1.5">
        {bars.map((b, i) => {
          const pct = max > 0 ? (b.hours / max) * 100 : 0;
          return (
            <div
              key={i}
              title={formatHours(b.hours)}
              className="flex-1 transition-[height] duration-500 ease-out motion-reduce:transition-none"
              style={{
                // A visible baseline for empty days, so the week reads as 7 slots.
                height: `${Math.max(pct, b.hours > 0 ? 8 : 4)}%`,
                background:
                  b.hours > 0
                    ? `linear-gradient(180deg, ${accent}, color-mix(in oklch, ${accent} 45%, transparent))`
                    : "var(--border)",
                opacity: b.hours > 0 ? 1 : 0.5,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bars.map((b, i) => (
          <span key={i} className="flex-1 text-center font-mono text-[9px] text-muted-foreground/60">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-secondary/30 px-3 py-2.5">
      <p className="label text-[10px] text-muted-foreground/70">{label}</p>
      <p className="mt-1 font-dot text-[22px] leading-none tabular-nums text-foreground">{value}</p>
    </div>
  );
}
