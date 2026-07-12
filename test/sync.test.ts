import { describe, expect, it, vi } from "vitest";
import { AGENT_VERSION, buildPayload, SyncClient } from "../src/sync.js";
import { freshStats } from "../src/store.js";

function statsWith(activeMs: number, combos = 0) {
  const s = freshStats(0);
  s.activeMsByTool = { "claude-code": activeMs };
  s.combos = combos;
  return s;
}

function okFetch(body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe("buildPayload", () => {
  it("contains only aggregates", () => {
    expect(buildPayload(statsWith(1234.9, 2), "max")).toEqual({
      version: 1,
      plan: "max",
      toolTotalsMs: { "claude-code": 1234 },
      totalCombos: 2,
      agentVersion: AGENT_VERSION,
      active: false,
      activeNow: [],
    });
  });

  it("carries the live presence flag and active tool ids when working", () => {
    expect(buildPayload(statsWith(1000, 0), "pro", true, ["claude-code"])).toMatchObject({
      active: true,
      activeNow: ["claude-code"],
    });
  });
});

describe("SyncClient", () => {
  const opts = {
    serverUrl: "https://vr.example/",
    accountToken: "tok",
    syncIntervalMs: 300_000,
    activeSyncIntervalMs: 60_000,
  };

  it("is disabled without serverUrl or accountToken", async () => {
    const fetchFn = okFetch();
    const off = new SyncClient({ ...opts, serverUrl: "", fetchFn });
    expect(off.enabled).toBe(false);
    expect(off.state.status).toBe("disabled");
    await off.maybeSync(statsWith(100), "pro", 0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts the payload with bearer auth, stripping trailing slashes", async () => {
    const fetchFn = okFetch();
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(60_000, 1), "pro", 1_000_000);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://vr.example/api/ingest");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({
      version: 1,
      plan: "pro",
      toolTotalsMs: { "claude-code": 60_000 },
      totalCombos: 1,
    });
    expect(sync.state.status).toBe("ok");
  });

  it("respects the sync interval", async () => {
    const fetchFn = okFetch();
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000);
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 60_000);
    expect(fetchFn).toHaveBeenCalledOnce();
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 300_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("never throws on network failure and records the error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const sync = new SyncClient({ ...opts, fetchFn: fetchFn as unknown as typeof fetch });
    await expect(sync.maybeSync(statsWith(1), "pro", 1_000_000)).resolves.toBeUndefined();
    expect(sync.state.status).toBe("error");
    expect(sync.state.lastError).toBe("ECONNREFUSED");
  });

  it("records HTTP errors without throwing", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 401 }));
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000);
    expect(sync.state).toMatchObject({ status: "error", lastError: "HTTP 401" });
  });

  it("syncs on the short interval while a tool is active", async () => {
    const fetchFn = okFetch();
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000, true);
    // Too soon even for the active interval.
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 59_000, true);
    expect(fetchFn).toHaveBeenCalledOnce();
    // A minute of coding later, the board hears about it.
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 60_000, true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("backs off to the idle interval when nothing is active", async () => {
    const fetchFn = okFetch();
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000, false);
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 60_000, false);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("takes the rank from the ingest response", async () => {
    const fetchFn = okFetch({ ok: true, rank: 12, totalPlayers: 840 });
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000);
    expect(sync.state).toMatchObject({ status: "ok", rank: 12, totalPlayers: 840 });
  });

  it("leaves rank null when the server does not send one", async () => {
    const fetchFn = okFetch({ ok: true, rank: null, totalPlayers: null });
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000);
    expect(sync.state).toMatchObject({ status: "ok", rank: null, totalPlayers: null });
  });

  it("survives a 200 with an unreadable body", async () => {
    const fetchFn = vi.fn(async () => new Response("not json", { status: 200 }));
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000);
    expect(sync.state).toMatchObject({ status: "ok", rank: null });
  });

  it("honors retry-after instead of hammering a rate-limited server", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, retryAfterS: 120 }), {
          status: 429,
          headers: { "retry-after": "120" },
        }),
    );
    const sync = new SyncClient({ ...opts, fetchFn });
    await sync.maybeSync(statsWith(1), "pro", 1_000_000, true);
    expect(sync.state.status).toBe("error");

    // The active interval has elapsed, but the server asked for 120s.
    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 60_000, true);
    expect(fetchFn).toHaveBeenCalledOnce();

    await sync.maybeSync(statsWith(1), "pro", 1_000_000 + 120_000, true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
