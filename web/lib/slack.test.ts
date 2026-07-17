import { describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeSlackCode } from "./slack";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const EXCHANGE = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "https://grindeasy.tech/api/slack/callback",
  code: "slack-code",
};

describe("buildAuthorizeUrl", () => {
  it("asks for the incoming-webhook scope and carries the state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "https://grindeasy.tech/api/slack/callback",
        state: "state-code",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    // A wider scope would let the server read messages; the whole design rests
    // on it only ever being able to post to the one channel the user picks.
    expect(url.searchParams.get("scope")).toBe("incoming-webhook");
    expect(url.searchParams.get("state")).toBe("state-code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://grindeasy.tech/api/slack/callback",
    );
  });
});

describe("exchangeSlackCode", () => {
  it("returns the webhook Slack minted", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        ok: true,
        team: { name: "Acme" },
        incoming_webhook: { url: "https://hooks.slack.com/services/T/B/x", channel: "#standup" },
      }),
    );

    const result = await exchangeSlackCode({ ...EXCHANGE, fetchFn: fetchFn as unknown as typeof fetch });

    expect(result).toEqual({
      ok: true,
      webhookUrl: "https://hooks.slack.com/services/T/B/x",
      channel: "#standup",
      teamName: "Acme",
    });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe("https://slack.com/api/oauth.v2.access");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("code")).toBe("slack-code");
    expect(body.get("client_secret")).toBe("csecret");
    // Slack checks this against the authorize call; a mismatch fails the exchange.
    expect(body.get("redirect_uri")).toBe("https://grindeasy.tech/api/slack/callback");
  });

  it("reports Slack's own error rather than throwing", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_code" }));
    const result = await exchangeSlackCode({ ...EXCHANGE, fetchFn: fetchFn as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, error: "invalid_code" });
  });

  it("fails when Slack says ok but sends no webhook", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true, team: { name: "Acme" } }));
    const result = await exchangeSlackCode({ ...EXCHANGE, fetchFn: fetchFn as unknown as typeof fetch });
    expect(result.ok).toBe(false);
  });

  it("fails on an HTTP error", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    const result = await exchangeSlackCode({ ...EXCHANGE, fetchFn: fetchFn as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, error: "Slack returned HTTP 500" });
  });

  it("fails when Slack is unreachable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await exchangeSlackCode({ ...EXCHANGE, fetchFn: fetchFn as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, error: "could not reach Slack" });
  });
});
