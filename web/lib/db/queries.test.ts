import { beforeEach, describe, expect, it } from "vitest";
import { rankBoard } from "../core/leaderboard";
import {
  boardRows,
  claimPairRequest,
  consumePairRequest,
  createPairRequest,
  creditTool,
  findLivePairRequest,
  getAgentToken,
  newUserCode,
  saveBaseline,
  upsertUser,
  type Db,
} from "./queries";
import { makeTestDb } from "./testing";

let db: Db;

beforeEach(async () => {
  db = (await makeTestDb()) as unknown as Db;
});

const MINUTE = 60_000;

describe("tool totals", () => {
  it("accumulates active ms across ingests", async () => {
    const user = await upsertUser(db, "1", "shashank", null);
    await creditTool(db, user.id, "claude-code", 5 * MINUTE);
    await creditTool(db, user.id, "claude-code", 3 * MINUTE);
    await creditTool(db, user.id, "codex", 2 * MINUTE);

    const rows = await boardRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.activeMs).toBe(10 * MINUTE);
  });

  it("stores active time beyond the int4 ceiling", async () => {
    // int4 maxes at 2_147_483_647 ms ≈ 24.8 days. A heavy user passes that.
    const beyondInt4 = 3_000_000_000;
    const user = await upsertUser(db, "1", "marathon", null);
    await creditTool(db, user.id, "claude-code", beyondInt4);

    const rows = await boardRows(db);
    expect(rows[0]!.activeMs).toBe(beyondInt4);
    expect(Number.isSafeInteger(rows[0]!.activeMs)).toBe(true);
  });

  it("ranks users by the shared scoring formula", async () => {
    const a = await upsertUser(db, "1", "alice", null);
    const b = await upsertUser(db, "2", "bob", null);
    await creditTool(db, a.id, "codex", 3_600_000); // 1h → 1 XP
    await creditTool(db, b.id, "codex", 7_200_000); // 2h → 2 XP

    const board = rankBoard(await boardRows(db));
    expect(board.map((e) => e.username)).toEqual(["bob", "alice"]);
    expect(board[0]!.rank).toBe(1);
  });
});

describe("user codes", () => {
  it("omits characters that are ambiguous when read aloud", () => {
    const codes = Array.from({ length: 200 }, newUserCode).join("");
    expect(codes).not.toMatch(/[ILOU01]/);
  });
});

describe("pairing", () => {
  it("is pending until a user claims it", async () => {
    const { deviceCode } = await createPairRequest(db, 10 * MINUTE);
    expect(await consumePairRequest(db, deviceCode, "laptop")).toEqual({ status: "pending" });
  });

  it("hands the agent a token once claimed", async () => {
    const user = await upsertUser(db, "1", "shashank", null);
    const { deviceCode, userCode } = await createPairRequest(db, 10 * MINUTE);

    expect(await claimPairRequest(db, userCode, user.id)).toBe(true);

    const result = await consumePairRequest(db, deviceCode, "laptop");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("unreachable");

    const record = await getAgentToken(db, result.accountToken);
    expect(record?.userId).toBe(user.id);
    // A brand new token starts with no baseline, so its first ingest credits
    // nothing. That is what makes minting per-device tokens safe.
    expect(record?.baseline).toBeNull();
  });

  it("accepts the user code case-insensitively", async () => {
    const user = await upsertUser(db, "1", "shashank", null);
    const { userCode } = await createPairRequest(db, 10 * MINUTE);
    expect(await claimPairRequest(db, userCode.toLowerCase(), user.id)).toBe(true);
  });

  it("can only be consumed once", async () => {
    const user = await upsertUser(db, "1", "shashank", null);
    const { deviceCode, userCode } = await createPairRequest(db, 10 * MINUTE);
    await claimPairRequest(db, userCode, user.id);

    const first = await consumePairRequest(db, deviceCode, "laptop");
    const second = await consumePairRequest(db, deviceCode, "laptop");

    expect(first.status).toBe("ready");
    expect(second.status).toBe("expired");
  });

  it("refuses a second claim on the same code", async () => {
    const attacker = await upsertUser(db, "1", "attacker", null);
    const victim = await upsertUser(db, "2", "victim", null);
    const { userCode } = await createPairRequest(db, 10 * MINUTE);

    expect(await claimPairRequest(db, userCode, victim.id)).toBe(true);
    expect(await claimPairRequest(db, userCode, attacker.id)).toBe(false);
  });

  it("expires, and an expired code cannot be claimed or consumed", async () => {
    const user = await upsertUser(db, "1", "shashank", null);
    const { deviceCode, userCode } = await createPairRequest(db, -1);

    expect(await findLivePairRequest(db, userCode)).toBeNull();
    expect(await claimPairRequest(db, userCode, user.id)).toBe(false);
    expect(await consumePairRequest(db, deviceCode, "laptop")).toEqual({ status: "expired" });
  });

  it("gives each device its own token and its own baseline", async () => {
    const user = await upsertUser(db, "1", "shashank", null);

    const pairDevice = async (label: string) => {
      const { deviceCode, userCode } = await createPairRequest(db, 10 * MINUTE);
      await claimPairRequest(db, userCode, user.id);
      const r = await consumePairRequest(db, deviceCode, label);
      if (r.status !== "ready") throw new Error("expected ready");
      return r.accountToken;
    };

    const laptop = await pairDevice("laptop");
    const desktop = await pairDevice("desktop");
    expect(laptop).not.toBe(desktop);

    // Two machines report wildly different cumulative totals. With one shared
    // baseline they would ratchet against each other and credit elapsed
    // wall-clock time for no work. Separate baselines keep each honest.
    await saveBaseline(db, laptop, {
      lastIngestMs: 1000,
      toolTotalsMs: { "claude-code": 360_000_000 },
      totalCombos: 0,
    });

    expect((await getAgentToken(db, laptop))?.baseline?.toolTotalsMs).toEqual({
      "claude-code": 360_000_000,
    });
    expect((await getAgentToken(db, desktop))?.baseline).toBeNull();
  });
});
