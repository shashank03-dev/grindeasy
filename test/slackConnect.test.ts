import { describe, expect, it, vi } from "vitest";
import {
  connectSlack,
  pollSlackOnce,
  startSlackConnect,
  SlackNotConfiguredError,
  type SlackPollOutcome,
} from "../src/slackConnect.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const START = {
  agentCode: "agent-secret",
  connectUrl: "https://board.example/slack/connect?code=state-code",
  expiresInS: 600,
  intervalS: 3,
};

const WEBHOOK = {
  webhookUrl: "https://hooks.slack.com/services/T/B/x",
  channel: "#standup",
  teamName: "Acme",
};

const noSleep = () => Promise.resolve();

describe("startSlackConnect", () => {
  it("posts to /api/slack/start and tolerates a trailing slash on serverUrl", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(START));
    const result = await startSlackConnect({ serverUrl: "https://board.example/", fetchFn });

    expect(fetchFn).toHaveBeenCalledWith("https://board.example/api/slack/start", {
      method: "POST",
    });
    expect(result.connectUrl).toBe(START.connectUrl);
  });

  it("reports an unconfigured server distinctly, so the caller can offer the paste flow", async () => {
    const fetchFn = vi.fn(async () => new Response("no slack app", { status: 503 }));
    await expect(startSlackConnect({ serverUrl: "https://board.example", fetchFn })).rejects.toThrow(
      SlackNotConfiguredError,
    );
  });

  it("throws on any other server failure", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(startSlackConnect({ serverUrl: "https://board.example", fetchFn })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});

describe("pollSlackOnce", () => {
  it("sends the agent code and nothing else", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ status: "pending" }));
    await pollSlackOnce({ serverUrl: "https://board.example", fetchFn }, "agent-secret");

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe("https://board.example/api/slack/poll");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ agentCode: "agent-secret" });
  });
});

describe("connectSlack", () => {
  it("polls until the browser half finishes, then returns the webhook", async () => {
    const outcomes: SlackPollOutcome[] = [
      { status: "pending" },
      { status: "pending" },
      { status: "ready", ...WEBHOOK },
    ];
    let poll = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/slack/start")) return jsonResponse(START);
      return jsonResponse(outcomes[poll++]!);
    });

    const onPrompt = vi.fn();
    const webhook = await connectSlack({
      serverUrl: "https://board.example",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
      onPrompt,
    });

    expect(webhook).toEqual(WEBHOOK);
    expect(poll).toBe(3);
    // The user must get the link before we start waiting on them.
    expect(onPrompt).toHaveBeenCalledWith(START);
  });

  it("rides out a transient poll failure rather than discarding the install", async () => {
    // The user may already have authorized in Slack by now, so a blip must not
    // throw away a webhook Slack has minted — retrying costs them a second install.
    const outcomes: (SlackPollOutcome | "boom")[] = [
      { status: "pending" },
      "boom",
      "boom",
      { status: "pending" },
      { status: "ready", ...WEBHOOK },
    ];
    let poll = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/slack/start")) return jsonResponse(START);
      const next = outcomes[poll++]!;
      if (next === "boom") return new Response("bad gateway", { status: 502 });
      return jsonResponse(next);
    });

    const webhook = await connectSlack({
      serverUrl: "https://board.example",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(webhook).toEqual(WEBHOOK);
    expect(poll).toBe(5);
  });

  it("gives up once poll failures look sustained rather than transient", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/slack/start")
        ? jsonResponse(START)
        : new Response("down", { status: 500 }),
    );

    await expect(
      connectSlack({
        serverUrl: "https://board.example",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow("HTTP 500");
  });

  it("resets the failure count after a success, so blips never accumulate", async () => {
    // Four failures, a success, then four more must not trip the threshold of 5.
    const script: ("boom" | SlackPollOutcome)[] = [
      "boom", "boom", "boom", "boom",
      { status: "pending" },
      "boom", "boom", "boom", "boom",
      { status: "ready", ...WEBHOOK },
    ];
    let poll = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/slack/start")) return jsonResponse(START);
      const next = script[poll++]!;
      if (next === "boom") return new Response("blip", { status: 503 });
      return jsonResponse(next);
    });

    const webhook = await connectSlack({
      serverUrl: "https://board.example",
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(webhook).toEqual(WEBHOOK);
    expect(poll).toBe(10);
  });

  it("surfaces the server's reason when the install fails", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/slack/start")
        ? jsonResponse(START)
        : jsonResponse({ status: "error", reason: "you cancelled the Slack install" }),
    );

    await expect(
      connectSlack({
        serverUrl: "https://board.example",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/cancelled the Slack install/);
  });

  it("gives up when the server says the link expired", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/slack/start")
        ? jsonResponse(START)
        : jsonResponse({ status: "expired" }),
    );

    await expect(
      connectSlack({
        serverUrl: "https://board.example",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/expired/);
  });

  it("gives up once the link's lifetime has elapsed, rather than polling forever", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/slack/start")
        ? jsonResponse({ ...START, expiresInS: 6 })
        : jsonResponse({ status: "pending" }),
    );

    // A clock that advances past the deadline instead of real waiting.
    let clock = 0;
    await expect(
      connectSlack({
        serverUrl: "https://board.example",
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: noSleep,
        now: () => (clock += 2500),
      }),
    ).rejects.toThrow(/expired/);
  });
});
