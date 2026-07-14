import { ParticleField } from "@/components/particle-field";
import { PlanBadge, TierBadge } from "@/components/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserMenu } from "@/components/user-menu";
import { getBoard } from "@/lib/board";
import type { BoardEntry } from "@/lib/core/leaderboard";
import { buildUserCard, type UserCardData } from "@/lib/core/user-card";
import { getDb } from "@/lib/db";
import { boardRows, getUserPresence, userToolTotals } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";

// Rendered at request time so `next build` never needs a database. Freshness is
// handled in getBoard(), which caches the query for 30s across all viewers.
export const dynamic = "force-dynamic";

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

// Fixed-width, zero-padded rank — a real TUI list, where the column width itself
// says "this is an ordered field". Ranks past 99 keep their natural width.
function formatRank(rank: number): string {
  return rank < 100 ? String(rank).padStart(2, "0") : String(rank);
}

// The personal dashboard is derived per request for the signed-in user, ranked
// against the whole field (not just the top 100 shown on the public board).
async function getUserCard(): Promise<UserCardData | null> {
  const user = await currentUser();
  if (!user) return null;
  const db = getDb();
  const [toolTotalsMs, rows, presence] = await Promise.all([
    userToolTotals(db, user.id),
    boardRows(db),
    getUserPresence(db, user.id),
  ]);
  return buildUserCard({
    username: user.username,
    avatar: user.avatar,
    discordId: user.discordId,
    plan: user.plan,
    combos: user.combos,
    toolTotalsMs,
    boardRows: rows,
    presence,
  });
}

export default async function LeaderboardPage() {
  const [entries, card] = await Promise.all([getBoard(), getUserCard()]);

  return (
    <>
      {/* Whole-page background: black when signed out, tier-colored particles
          taking birth once the user is authenticated. Sits behind everything. */}
      <ParticleField
        signedIn={card !== null}
        tier={card?.tierName ?? null}
        online={card?.isOnline ?? false}
      />

      {/* Account control, pinned above the board and the particle field. */}
      <div className="fixed right-4 top-4 z-30">
        <UserMenu data={card} />
      </div>

      {/* Faint phosphor bleed from the top — the only ambient light on the surface. */}
      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-24 pt-14 [background-image:radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_55%)]">
      <header className="mb-10">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="text-primary">▲</span> grindeasy
        </p>
        {/* Fraunces at display optical size, with one italic word carrying the
            product's whole promise — active time, not billed time. */}
        <h1 className="mt-5 max-w-[15ch] font-heading text-[2rem] font-normal leading-[1.05] tracking-[-0.015em] text-foreground [font-optical-sizing:auto] [font-variation-settings:'opsz'_144] sm:text-5xl">
          Time <em className="font-normal italic">actually</em> spent coding with AI.
        </h1>
        <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
          Active time only, measured while a tool is working. Combos reward using two tools in the
          same five-minute window. Your plan is shown for context and never changes your score.
        </p>
        <code className="mt-7 inline-flex items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 py-2.5 font-mono text-[13px] text-foreground">
          <span className="text-primary">$</span> npx grindeasy
        </code>
      </header>

      {entries.length === 0 ? <EmptyBoard /> : <Board entries={entries} />}

      <p className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground/70">
        <span>Synced every 5 minutes. The agent self-reports; the server clamps.</span>
      </p>
    </main>
    </>
  );
}

function Board({ entries }: { entries: BoardEntry[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-input bg-card shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
      {/* Title bar — the board framed as a running program, not a web section. */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">Leaderboard</span> · top 100 · ranked by
          XP
        </p>
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          live
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14.5px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70">
              <th className="w-[68px] px-4 py-3 text-left font-semibold">#</th>
              <th className="px-4 py-3 text-left font-semibold">Developer</th>
              <th className="px-4 py-3 text-left font-semibold">Tier</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-right font-semibold">Active</th>
              <th className="px-4 py-3 text-right font-semibold">Combos</th>
              <th className="px-4 py-3 text-right font-semibold">XP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isTop = entry.rank === 1;
              return (
                <tr
                  key={entry.discordId}
                  className={
                    isTop
                      ? "border-b border-border bg-[linear-gradient(90deg,color-mix(in_oklch,var(--primary)_13%,transparent),transparent_65%)] transition-colors last:border-0"
                      : "border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                  }
                >
                  {/* Serif rank numerals — Fraunces threads the editorial blend
                      into the data, like a magazine ranked list. */}
                  <td
                    className={
                      isTop
                        ? "px-4 py-3.5 font-heading text-[19px] tabular-nums text-primary [font-variation-settings:'opsz'_40] shadow-[inset_2px_0_0_var(--primary)]"
                        : "px-4 py-3.5 font-heading text-[19px] tabular-nums text-muted-foreground [font-variation-settings:'opsz'_40]"
                    }
                  >
                    {formatRank(entry.rank)}
                  </td>

                  <td className="px-4 py-3.5">
                    <span className="flex items-center gap-3">
                      {/* Avatar takes no size prop; sizing is Tailwind classes. */}
                      <Avatar className="h-7 w-7 rounded-lg">
                        {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="rounded-lg bg-secondary text-[10px] text-muted-foreground">
                          {entry.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium tracking-[-0.005em] text-foreground">
                        {entry.username}
                      </span>
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <TierBadge name={entry.tierName} glyph={entry.tierGlyph} />
                  </td>

                  <td className="px-4 py-3.5">
                    <PlanBadge badge={entry.planBadge} />
                  </td>

                  {/* Active hours are the loudest data — the unit of the whole product. */}
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-foreground">
                    {formatHours(entry.hours)}
                  </td>

                  <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                    {entry.combos}
                  </td>

                  <td
                    className={
                      isTop
                        ? "px-4 py-3.5 text-right font-semibold tabular-nums text-primary"
                        : "px-4 py-3.5 text-right font-semibold tabular-nums text-foreground"
                    }
                  >
                    {entry.xp.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className="rounded-xl border border-dashed border-input px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Nobody has paired an agent yet.</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">
        Run <code className="text-primary">npx grindeasy</code> in a terminal, then{" "}
        <code className="text-primary">grindeasy login</code> to claim the first place on this
        board.
      </p>
    </div>
  );
}
