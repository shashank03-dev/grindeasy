import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/db.js";

let store: Store;

beforeEach(() => {
  store = new Store(":memory:");
});
afterEach(() => store.close());

describe("Store", () => {
  it("upserts users by discord id and updates name/avatar", () => {
    const a = store.upsertUser("100", "alice", null);
    const b = store.upsertUser("100", "alice2", "hash");
    expect(b.id).toBe(a.id);
    expect(b.username).toBe("alice2");
    expect(b.avatar).toBe("hash");
  });

  it("credits tool time cumulatively and aggregates board rows", () => {
    const u = store.upsertUser("100", "alice", null);
    store.creditTool(u.id, "claude-code", 1000);
    store.creditTool(u.id, "claude-code", 500);
    store.creditTool(u.id, "codex", 200);
    store.addCombos(u.id, 2);
    store.setPlan(u.id, "max");

    expect(store.userToolTotals(u.id)).toEqual({ "claude-code": 1500, codex: 200 });
    const rows = store.boardRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      discordId: "100",
      username: "alice",
      plan: "max",
      activeMs: 1700,
      combos: 2,
    });
  });

  it("round-trips sessions", () => {
    const u = store.upsertUser("100", "alice", null);
    const token = store.createSession(u.id);
    expect(store.getSessionUser(token)?.id).toBe(u.id);
    store.deleteSession(token);
    expect(store.getSessionUser(token)).toBeNull();
    expect(store.getSessionUser("nope")).toBeNull();
  });

  it("issues one stable agent token per user and stores baselines", () => {
    const u = store.upsertUser("100", "alice", null);
    const t1 = store.getOrCreateAgentToken(u.id);
    const t2 = store.getOrCreateAgentToken(u.id);
    expect(t1).toBe(t2);
    expect(t1).toHaveLength(64);

    expect(store.getAgentToken(t1)).toEqual({ userId: u.id, baseline: null });
    const baseline = { lastIngestMs: 5, toolTotalsMs: { codex: 9 }, totalCombos: 1 };
    store.saveBaseline(t1, baseline);
    expect(store.getAgentToken(t1)?.baseline).toEqual(baseline);
    expect(store.getAgentToken("bogus")).toBeNull();
  });

  it("includes zero-activity users on the board", () => {
    store.upsertUser("100", "alice", null);
    expect(store.boardRows()[0]?.activeMs).toBe(0);
  });
});
