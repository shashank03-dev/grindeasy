import { PlanBadge, TierBadge } from "@/components/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBoard } from "@/lib/board";
import type { BoardEntry } from "@/lib/core/leaderboard";

// Rendered at request time so `next build` never needs a database. Freshness is
// handled in getBoard(), which caches the query for 30s across all viewers.
export const dynamic = "force-dynamic";

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

export default async function LeaderboardPage() {
  const entries = await getBoard();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <header className="mb-12">
        <h1 className="font-mono text-sm font-medium tracking-wide text-primary">grindeasy</h1>
        <p className="mt-3 max-w-[62ch] text-2xl font-semibold tracking-tight text-foreground">
          Ranked by time actually spent coding with AI tools.
        </p>
        <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">
          Active time only, measured while a tool is working. Combos reward using two tools in the
          same five-minute window. Your plan is shown for context and never changes your score.
        </p>
        <code className="mt-6 inline-block rounded border border-border bg-card px-3 py-2 font-mono text-sm text-foreground">
          npx grindeasy
        </code>
      </header>

      {entries.length === 0 ? <EmptyBoard /> : <Board entries={entries} />}
    </main>
  );
}

function Board({ entries }: { entries: BoardEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-14 text-xs font-normal text-muted-foreground">Rank</TableHead>
          <TableHead className="text-xs font-normal text-muted-foreground">Developer</TableHead>
          <TableHead className="text-xs font-normal text-muted-foreground">Tier</TableHead>
          <TableHead className="w-16 text-xs font-normal text-muted-foreground">Plan</TableHead>
          <TableHead className="w-24 text-right text-xs font-normal text-muted-foreground">
            Active
          </TableHead>
          <TableHead className="w-20 text-right text-xs font-normal text-muted-foreground">
            Combos
          </TableHead>
          <TableHead className="w-24 text-right text-xs font-normal text-muted-foreground">
            XP
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.discordId}>
            <TableCell
              className={
                entry.rank === 1
                  ? "font-mono text-sm tabular-nums text-primary"
                  : "font-mono text-sm tabular-nums text-muted-foreground"
              }
            >
              {entry.rank}
            </TableCell>

            <TableCell>
              <span className="flex items-center gap-3">
                {/* Avatar takes no size prop; sizing is Tailwind classes. */}
                <Avatar className="h-7 w-7">
                  {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-[10px]">
                    {entry.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">{entry.username}</span>
              </span>
            </TableCell>

            <TableCell>
              <TierBadge name={entry.tierName} glyph={entry.tierGlyph} />
            </TableCell>

            <TableCell>
              <PlanBadge badge={entry.planBadge} />
            </TableCell>

            <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
              {formatHours(entry.hours)}
            </TableCell>

            <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
              {entry.combos}
            </TableCell>

            <TableCell className="text-right font-mono text-sm font-medium tabular-nums text-foreground">
              {entry.xp.toFixed(1)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyBoard() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Nobody has paired an agent yet.</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">
        Run <code className="font-mono text-foreground">npx grindeasy</code> in a terminal, then{" "}
        <code className="font-mono text-foreground">grindeasy login</code> to claim the first place
        on this board.
      </p>
    </div>
  );
}
