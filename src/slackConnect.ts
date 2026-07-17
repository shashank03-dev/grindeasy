import { openBrowser } from "./pair.js";

/**
 * "Add to Slack" — the same device-authorization shape as pairing, for a
 * different payload. The browser half ends with Slack minting a webhook bound to
 * the channel the user picked; this agent collects that webhook by polling and
 * then posts to it directly. The server only brokers the handoff.
 */

export interface SlackConnectStart {
  agentCode: string;
  connectUrl: string;
  expiresInS: number;
  intervalS: number;
}

export interface SlackWebhook {
  webhookUrl: string;
  channel: string;
  teamName: string;
}

export type SlackPollOutcome =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "error"; reason: string }
  | ({ status: "ready" } & SlackWebhook);

export interface SlackConnectOptions {
  serverUrl: string;
  fetchFn?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPrompt?: (info: SlackConnectStart) => void;
}

/**
 * Thrown when the server has no Slack app configured. Distinct from a real
 * failure: the caller offers the paste-a-URL flow instead of an error.
 */
export class SlackNotConfiguredError extends Error {
  constructor() {
    super("this server has no Slack app configured");
    this.name = "SlackNotConfiguredError";
  }
}

function base(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}

export async function startSlackConnect(opts: SlackConnectOptions): Promise<SlackConnectStart> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(`${base(opts.serverUrl)}/api/slack/start`, { method: "POST" });
  if (res.status === 503) throw new SlackNotConfiguredError();
  if (!res.ok) throw new Error(`Slack connect could not start: HTTP ${res.status}`);
  return (await res.json()) as SlackConnectStart;
}

export async function pollSlackOnce(
  opts: SlackConnectOptions,
  agentCode: string,
): Promise<SlackPollOutcome> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(`${base(opts.serverUrl)}/api/slack/poll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentCode }),
  });
  if (!res.ok) throw new Error(`Slack connect failed: HTTP ${res.status}`);
  return (await res.json()) as SlackPollOutcome;
}

/**
 * Run the full flow and return the webhook Slack minted. Resolves only once the
 * user finishes the install in a browser; throws when they cancel, when Slack
 * refuses, or when the link expires.
 */
export async function connectSlack(opts: SlackConnectOptions): Promise<SlackWebhook> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;

  const start = await startSlackConnect(opts);
  opts.onPrompt?.(start);

  const deadline = now() + start.expiresInS * 1000;
  while (now() < deadline) {
    await sleep(start.intervalS * 1000);
    const outcome = await pollSlackOnce(opts, start.agentCode);
    if (outcome.status === "ready") {
      return {
        webhookUrl: outcome.webhookUrl,
        channel: outcome.channel,
        teamName: outcome.teamName,
      };
    }
    if (outcome.status === "error") throw new Error(outcome.reason);
    if (outcome.status === "expired") break;
  }
  throw new Error("the Slack connect link expired before it was authorized");
}

export { openBrowser };
