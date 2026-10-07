import Link from "next/link";
import { BoardField } from "@/components/site/board-field";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { PlanBadge, TierBadge } from "@/components/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserMenu } from "@/components/user-menu";
import { getBoard, getWeeklyBoard } from "@/lib/board";
import type { BoardEntry } from "@/lib/core/leaderboard";
import { buildUserCard, buildWeeklyUserCard, type UserCardData } from "@/lib/core/user-card";
import { isoWeekRangeUtc } from "@/lib/core/week";
import { getDb } from "@/lib/db";
import {
  boardRows,
  getUserPresence,
  userToolTotals,
  userWeek,
  weeklyBoardRows,
} from "@/lib/db/queries";
import { currentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type Range = "all" | "weekly";

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
// against the whole field (not just the top 100 shown on the public board). It
// follows the same range toggle as the board, so both switch together.
async function getUserCard(range: Range): Promise<UserCardData | null> {
  const user = await currentUser();
  if (!user) return null;
  const db = getDb();

  if (range === "weekly") {
    const week = isoWeekRangeUtc(Date.now());
    const [lifetimeToolTotalsMs, weekly, weeklyRows, presence] = await Promise.all([
      userToolTotals(db, user.id),
      userWeek(db, user.id, week.days),
      weeklyBoardRows(db, week.start, week.end),
      getUserPresence(db, user.id),
    ]);
    return buildWeeklyUserCard({
      username: user.username,
      avatar: user.avatar,
      discordId: user.discordId,
      plan: user.plan,
      lifetimeToolTotalsMs,
      lifetimeCombos: user.combos,
      weeklyToolTotalsMs: weekly.toolTotalsMs,
      weeklyCombos: weekly.combos,
      weeklyBoardRows: weeklyRows,
      perDay: weekly.perDay,
      weekDays: week.days,
      presence,
    });
  }

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

// The ranked board for the requested range. Kept out of the component body so
// the render stays pure — the current week is read from the clock here.
function getRangeBoard(range: Range): Promise<BoardEntry[]> {
  if (range === "weekly") {
    const week = isoWeekRangeUtc(Date.now());
    return getWeeklyBoard(week.start, week.end);
  }
  return getBoard();
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range: Range = (await searchParams).range === "weekly" ? "weekly" : "all";
  const [entries, card] = await Promise.all([getRangeBoard(range), getUserCard(range)]);
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <>
      {/* The same dither field as the landing, held on one pose. Signed in,
          it turns into your tier's diamond in your tier's color. */}
      <BoardField tier={card?.tierName ?? null} online={card?.isOnline ?? false} />
      <SiteHeader slot={<UserMenu data={card} />} />

      <main className="relative z-10 w-full px-4 pb-28 pt-28 md:px-10 md:pt-36">
        <header className="grid gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <p className="label flex items-center gap-3 text-muted-foreground">
              <span className="pulse" /> The board · live
            </p>
            <h1 className="display mt-6 max-w-[14ch] text-[clamp(3rem,7.4vw,8rem)] text-paper">
              Time actually spent coding with AI.
            </h1>
          </div>
          <div className="flex flex-col gap-6 border border-line bg-ink/75 p-5 backdrop-blur-md md:col-span-4">
            <p className="max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
              Active time only, measured while a tool is working. Combos reward two tools in the
              same five-minute window. Your plan shows for context and never changes your score.
            </p>
            <code className="shell self-start">
              <span className="text-signal">$</span> npx grindeasy
            </code>
          </div>
        </header>

        <div className="mt-16 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <dl className="flex gap-10">
            <div>
              <dt className="label text-muted-foreground">Players</dt>
              <dd className="mt-2 font-dot text-[28px] leading-none tabular-nums text-paper">
                {entries.length}
              </dd>
            </div>
            <div>
              <dt className="label text-muted-foreground">
                {range === "weekly" ? "Hours this week" : "Hours logged"}
              </dt>
              <dd className="mt-2 font-dot text-[28px] leading-none tabular-nums text-paper">
                {Math.round(totalHours).toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
          <RangeToggle range={range} />
        </div>

        {entries.length === 0 ? <EmptyBoard range={range} /> : <Board entries={entries} />}

        <p className="label mt-6 flex flex-wrap justify-between gap-2 text-muted-foreground/70">
          <span>
            {range === "weekly"
              ? "This week's active time, in UTC. Resets every Monday."
              : "Synced every 5 minutes. The agent self-reports; the server clamps."}
          </span>
          <span>Top 100 · ranked by XP</span>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

// Two links styled as a segmented control. The page is SSR, so switching range
// is a navigation, not client state — the URL stays shareable and both the board
// and the personal card re-render off the same param.
function RangeToggle({ range }: { range: Range }) {
  const base = "label px-3 py-2 transition-colors";
  const on = "bg-paper text-ink";
  const off = "text-muted-foreground hover:text-paper";
  return (
    <div className="inline-flex items-center border border-input p-0.5">
      <Link href="/leaderboard?range=weekly" className={cn(base, range === "weekly" ? on : off)}>
        This week
      </Link>
      <Link href="/leaderboard" className={cn(base, range === "all" ? on : off)}>
        All time
      </Link>
    </div>
  );
}

function Board({ entries }: { entries: BoardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="label border-b border-line text-left text-[10.5px] text-muted-foreground">
            <th className="w-[84px] py-4 pr-4 font-normal">Rank</th>
            <th className="py-4 pr-4 font-normal">Developer</th>
            <th className="py-4 pr-4 font-normal">Tier</th>
            <th className="py-4 pr-4 font-normal">Plan</th>
            <th className="py-4 pr-4 text-right font-normal">Active</th>
            <th className="py-4 pr-4 text-right font-normal">Combos</th>
            <th className="py-4 text-right font-normal">XP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isTop = entry.rank === 1;
            const podium = entry.rank <= 3;
            return (
              <tr
                key={entry.discordId}
                className={cn(
                  "group border-b border-line transition-colors hover:bg-paper/[0.03]",
                  isTop && "bg-[linear-gradient(90deg,rgb(156_242_127/0.09),transparent_60%)]",
                )}
              >
                {/* Pixel rank numerals — a fixed-width ordered column, read as
                    data. The podium prints at full size. */}
                <td className="py-4 pr-4 align-middle">
                  <span
                    className={cn(
                      "font-pixel tabular-nums leading-none",
                      podium ? "text-[30px]" : "text-[20px] text-muted-foreground",
                      isTop && "text-signal",
                      podium && !isTop && "text-paper",
                    )}
                  >
                    {formatRank(entry.rank)}
                  </span>
                </td>

                <td className="py-4 pr-4">
                  <span className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 rounded-none after:rounded-none">
                      {entry.avatarUrl ? (
                        <AvatarImage src={entry.avatarUrl} alt="" className="rounded-none" />
                      ) : null}
                      <AvatarFallback className="rounded-none bg-secondary font-mono text-[10px] text-muted-foreground">
                        {entry.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[15px] font-medium tracking-[-0.01em] text-paper">
                      {entry.username}
                    </span>
                  </span>
                </td>

                <td className="py-4 pr-4">
                  <TierBadge name={entry.tierName} glyph={entry.tierGlyph} />
                </td>

                <td className="py-4 pr-4">
                  <PlanBadge badge={entry.planBadge} />
                </td>

                {/* Active hours are the loudest data — the unit of the whole product. */}
                <td className="py-4 pr-4 text-right font-dot text-[20px] tabular-nums text-paper">
                  {formatHours(entry.hours)}
                </td>

                <td className="py-4 pr-4 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                  {entry.combos}
                </td>

                <td
                  className={cn(
                    "py-4 text-right font-mono text-[13px] tabular-nums",
                    isTop ? "text-signal" : "text-paper",
                  )}
                >
                  {entry.xp.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyBoard({ range }: { range: Range }) {
  const [title, body] =
    range === "weekly"
      ? [
          "No one's logged time this week yet.",
          "The week resets every Monday. Code with a tracked tool and you'll be first on the board.",
        ]
      : ["Nobody has paired an agent yet.", null];
  return (
    <div className="border-b border-line py-24 text-center">
      <p className="font-pixel text-[clamp(2.4rem,6vw,4.5rem)] leading-none text-paper/90">00</p>
      <p className="mt-6 text-[15px] text-paper">{title}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        {body ?? (
          <>
            Run <code className="font-mono text-signal">npx grindeasy</code> in a terminal, then{" "}
            <code className="font-mono text-signal">grindeasy login</code> to claim the first place
            on this board.
          </>
        )}
      </p>
    </div>
  );
}
