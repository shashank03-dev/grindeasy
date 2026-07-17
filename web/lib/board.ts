import { unstable_cache } from "next/cache";
import { rankBoard, type BoardEntry } from "./core/leaderboard";
import { getDb } from "./db";
import { boardRows, weeklyBoardRows } from "./db/queries";

export const BOARD_CACHE_TAG = "board";

/**
 * One database read per 30 seconds, shared by every viewer.
 *
 * Agents push at most once every five minutes, so anything finer is spend
 * without freshness. The cache lives at the data layer rather than as a route
 * `revalidate`, because a statically prerendered route would force a database
 * read during `next build` — and the build has no DATABASE_URL.
 */
export const getBoard = unstable_cache(
  async (): Promise<BoardEntry[]> => rankBoard(await boardRows(getDb())),
  ["leaderboard"],
  { revalidate: 30, tags: [BOARD_CACHE_TAG] },
);

// The week's day-key range is part of the cache args, so each week caches
// separately and a new Monday simply misses the old key and reads fresh.
const weeklyBoard = unstable_cache(
  async (start: string, end: string): Promise<BoardEntry[]> =>
    rankBoard(await weeklyBoardRows(getDb(), start, end)),
  ["leaderboard-weekly"],
  { revalidate: 30, tags: [BOARD_CACHE_TAG] },
);

export function getWeeklyBoard(start: string, end: string): Promise<BoardEntry[]> {
  return weeklyBoard(start, end);
}
