import { describe, expect, it, vi } from "vitest";
import { AGENT_VERSION, buildPayload, SyncClient } from "../src/sync.js";
import { freshStats } from "../src/store.js";

function statsWith(activeMs: number, combos = 0) {
  const s = freshStats(0);
  s.activeMsByTool = { "claude-code": activeMs };
  s.combos = combos;
  return s;
}

function okFetch() {
  return vi.fn(async () => new Response("{}", { status: 200 }));
}

describe("buildPayload", () => {
  it("contains only aggregates", () => {
    expect(buildPayload(statsWith(1234.9, 2), "max")).toEqual({
      version: 1,
      plan: "max",
      toolTotalsMs: { "claude-code": 1234 },
      totalCombos: 2,
      agentVersion: AGENT_VERSION,
    });
  });
});

describe("SyncClient", () => {
  const opts = { serverUrl: "https://vr.example/", accountToken: "tok", syncIntervalMs: 300_000 };

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
});
