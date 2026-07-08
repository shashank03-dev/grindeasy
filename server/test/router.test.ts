import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { createHandler } from "../src/router.js";
import { MIN_INGEST_GAP_MS } from "../src/ingest.js";

let store: Store;
let server: Server;
let base: string;
let clock: number;

beforeEach(async () => {
  store = new Store(":memory:");
  clock = 1_000_000_000;
  const handler = createHandler({
    store,
    env: {
      port: 0,
      baseUrl: "http://localhost",
      discordClientId: "",
      discordClientSecret: "",
      dbPath: ":memory:",
    },
    now: () => clock,
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  store.close();
});

function ingest(token: string, body: unknown) {
  return fetch(`${base}/api/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MIN = 60_000;

describe("router", () => {
  it("serves healthz and an empty leaderboard", async () => {
    const health = await (await fetch(`${base}/healthz`)).json();
    expect(health).toEqual({ ok: true });
    const board = (await (await fetch(`${base}/api/leaderboard`)).json()) as {
      entries: unknown[];
    };
    expect(board.entries).toEqual([]);
  });

  it("rejects ingest with a bad token", async () => {
    const res = await ingest("bogus", { version: 1, plan: "pro", toolTotalsMs: {}, totalCombos: 0 });
    expect(res.status).toBe(401);
  });

  it("accepts ingest, credits clamped deltas, and shows the user on the board", async () => {
    const user = store.upsertUser("100", "alice", null);
    const token = store.getOrCreateAgentToken(user.id);

    // First ingest: baseline only.
    const first = await ingest(token, {
      version: 1,
      plan: "max",
      toolTotalsMs: { "claude-code": 0 },
      totalCombos: 0,
      agentVersion: "t",
    });
    expect(first.status).toBe(200);

    // Five minutes later: 3 minutes of claimed activity → fully credited.
    clock += 5 * MIN;
    const second = (await (
      await ingest(token, {
        version: 1,
        plan: "max",
        toolTotalsMs: { "claude-code": 3 * MIN },
        totalCombos: 1,
        agentVersion: "t",
      })
    ).json()) as { ok: boolean; creditedMsByTool: Record<string, number> };
    expect(second.creditedMsByTool).toEqual({ "claude-code": 3 * MIN });

    const board = (await (await fetch(`${base}/api/leaderboard`)).json()) as {
      entries: Array<{ username: string; activeMs: number; combos: number; planBadge: string }>;
    };
    expect(board.entries[0]).toMatchObject({
      username: "alice",
      activeMs: 3 * MIN,
      combos: 1,
      planBadge: "MAX",
    });
  });

  it("rate limits back-to-back ingests with 429 + retry-after", async () => {
    const user = store.upsertUser("100", "alice", null);
    const token = store.getOrCreateAgentToken(user.id);
    const body = { version: 1, plan: "pro", toolTotalsMs: {}, totalCombos: 0, agentVersion: "t" };

    expect((await ingest(token, body)).status).toBe(200);
    clock += MIN_INGEST_GAP_MS - 1000;
    const limited = await ingest(token, body);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("1");
  });

  it("rejects malformed ingest bodies", async () => {
    const user = store.upsertUser("100", "alice", null);
    const token = store.getOrCreateAgentToken(user.id);
    expect((await ingest(token, { version: 99 })).status).toBe(400);
  });

  it("serves the landing page and a 404 page", async () => {
    const landing = await fetch(`${base}/`);
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain("global leaderboard");
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it("returns 503 for login when oauth is not configured", async () => {
    expect((await fetch(`${base}/auth/login`, { redirect: "manual" })).status).toBe(503);
  });

  it("redirects /me to login when not authenticated", async () => {
    const res = await fetch(`${base}/me`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/login");
  });
});
