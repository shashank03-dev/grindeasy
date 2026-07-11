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

  it("returns the caller's standing so the agent can put it on the card", async () => {
    // One rival well ahead of us, so our rank is a real number, not just 1.
    const rival = store.upsertUser("200", "rival", null);
    store.creditTool(rival.id, "claude-code", 100 * 3_600_000);

    const user = store.upsertUser("100", "alice", null);
    const token = store.getOrCreateAgentToken(user.id);

    const payload = (totalMs: number) => ({
      version: 1 as const,
      plan: "pro" as const,
      toolTotalsMs: { "claude-code": totalMs },
      totalCombos: 0,
      agentVersion: "t",
    });

    const first = (await (await ingest(token, payload(0))).json()) as {
      rank: number;
      totalPlayers: number;
    };
    expect(first).toMatchObject({ rank: 2, totalPlayers: 2 });

    // Out-earn the rival and the very next sync tells us we took the lead.
    clock += 5 * MIN;
    const second = (await (await ingest(token, payload(5 * MIN))).json()) as { rank: number };
    expect(second.rank).toBe(2);

    store.creditTool(user.id, "claude-code", 200 * 3_600_000);
    clock += 5 * MIN;
    const third = (await (await ingest(token, payload(10 * MIN))).json()) as { rank: number };
    expect(third.rank).toBe(1);
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

describe("device pairing", () => {
  function startPair() {
    return fetch(`${base}/api/pair/start`, { method: "POST" });
  }
  function poll(deviceCode: string) {
    return fetch(`${base}/api/pair/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode, label: "laptop (linux)" }),
    });
  }
  function approve(code: string, session: string) {
    return fetch(`${base}/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `vr_session=${session}`,
      },
      body: new URLSearchParams({ code }).toString(),
      redirect: "manual",
    });
  }

  it("pairs an agent end to end without the user copying a token", async () => {
    const user = store.upsertUser("100", "alice", null);
    const session = store.createSession(user.id);

    const start = (await (await startPair()).json()) as {
      deviceCode: string;
      userCode: string;
      verifyUrl: string;
      intervalS: number;
    };
    expect(start.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(start.verifyUrl).toContain(`/pair?code=${start.userCode}`);

    // Nobody has approved yet.
    expect(await (await poll(start.deviceCode)).json()).toEqual({ status: "pending" });

    // The human approves in the browser.
    expect((await approve(start.userCode, session)).status).toBe(200);

    // The agent collects its own token.
    const ready = (await (await poll(start.deviceCode)).json()) as {
      status: string;
      accountToken: string;
    };
    expect(ready.status).toBe("ready");
    expect(ready.accountToken).toBe(store.getOrCreateAgentToken(user.id));

    // And that token actually works for ingest.
    const res = await ingest(ready.accountToken, {
      version: 1,
      plan: "pro",
      toolTotalsMs: { "claude-code": 0 },
      totalCombos: 0,
      agentVersion: "t",
    });
    expect(res.status).toBe(200);
  });

  it("burns the code, so a stolen device code can't be replayed", async () => {
    const user = store.upsertUser("100", "alice", null);
    const session = store.createSession(user.id);
    const start = (await (await startPair()).json()) as { deviceCode: string; userCode: string };

    await approve(start.userCode, session);
    expect(((await (await poll(start.deviceCode)).json()) as { status: string }).status).toBe("ready");
    expect(await (await poll(start.deviceCode)).json()).toEqual({ status: "expired" });
  });

  it("expires a code nobody approved in time", async () => {
    const start = (await (await startPair()).json()) as { deviceCode: string };
    clock += 11 * MIN;
    expect(await (await poll(start.deviceCode)).json()).toEqual({ status: "expired" });
  });

  it("refuses an expired code at approval time", async () => {
    const user = store.upsertUser("100", "alice", null);
    const session = store.createSession(user.id);
    const start = (await (await startPair()).json()) as { userCode: string };

    clock += 11 * MIN;
    expect((await approve(start.userCode, session)).status).toBe(400);
  });

  it("rejects a made-up code", async () => {
    const user = store.upsertUser("100", "alice", null);
    const session = store.createSession(user.id);
    expect((await approve("ZZZZ-ZZZZ", session)).status).toBe(400);
  });

  it("treats an unknown device code as expired, not as someone else's", async () => {
    expect(await (await poll("deadbeef")).json()).toEqual({ status: "expired" });
  });

  it("sends an anonymous visitor to log in first, keeping the code", async () => {
    const res = await fetch(`${base}/pair?code=ABCD-EFGH`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/login?next=%2Fpair%3Fcode%3DABCD-EFGH");
  });

  it("will not bounce a login through an attacker's URL", async () => {
    const res = await fetch(`${base}/auth/login?next=//evil.example/steal`, { redirect: "manual" });
    const cookies = res.headers.getSetCookie().join(";");
    expect(cookies).not.toContain("evil.example");
  });
});
