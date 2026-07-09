import { describe, expect, it, vi } from "vitest";
import { pair, pollOnce, startPairing, type PollOutcome } from "../src/pair.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const START = {
  deviceCode: "device-secret",
  userCode: "KXQ4-9BTM",
  verifyUrl: "https://viberank.dev/pair?code=KXQ4-9BTM",
  expiresInS: 600,
  intervalS: 3,
};

const noSleep = () => Promise.resolve();

describe("startPairing", () => {
  it("posts to /api/pair/start and tolerates a trailing slash on serverUrl", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(START));
    const result = await startPairing({ serverUrl: "https://viberank.dev/", fetchFn });

    expect(fetchFn).toHaveBeenCalledWith("https://viberank.dev/api/pair/start", { method: "POST" });
    expect(result.userCode).toBe("KXQ4-9BTM");
  });

  it("throws when the server rejects the request", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(startPairing({ serverUrl: "https://viberank.dev", fetchFn })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});

describe("pollOnce", () => {
  it("sends the device code and a device label", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ status: "pending" }));
    await pollOnce({ serverUrl: "https://viberank.dev", fetchFn }, "device-secret");

    const [, init] = fetchFn.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.deviceCode).toBe("device-secret");
    expect(typeof body.label).toBe("string");
    expect(body.label.length).toBeGreaterThan(0);
  });
});

describe("pair", () => {
  it("polls until a human authorizes, then returns the token", async () => {
    const outcomes: PollOutcome[] = [
      { status: "pending" },
      { status: "pending" },
      { status: "ready", accountToken: "agent-token" },
    ];
    let poll = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/pair/start")) return jsonResponse(START);
      return jsonResponse(outcomes[poll++]!);
    });

    const onPrompt = vi.fn();
    const token = await pair({
      serverUrl: "https://viberank.dev",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
      onPrompt,
    });

    expect(token).toBe("agent-token");
    expect(poll).toBe(3);
    // The user must be shown the code before we start waiting on them.
    expect(onPrompt).toHaveBeenCalledWith(START);
  });

  it("gives up when the server says the code expired", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/pair/start")
        ? jsonResponse(START)
        : jsonResponse({ status: "expired" }),
    );

    await expect(
      pair({
        serverUrl: "https://viberank.dev",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/expired/);
  });

  it("gives up once the code's lifetime has elapsed, rather than polling forever", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/pair/start")
        ? jsonResponse({ ...START, expiresInS: 6 })
        : jsonResponse({ status: "pending" }),
    );

    // A clock that advances past the deadline instead of real waiting.
    let clock = 0;
    await expect(
      pair({
        serverUrl: "https://viberank.dev",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
        now: () => (clock += 2500),
      }),
    ).rejects.toThrow(/expired/);
  });
});
