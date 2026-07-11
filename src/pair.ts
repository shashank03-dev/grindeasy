import { hostname, platform } from "node:os";
import { spawn } from "node:child_process";

/**
 * Device-authorization pairing, the same shape `gh auth login` and `docker
 * login` use. The agent never sees the user's Discord credentials, and the user
 * never copies a token by hand: the browser authorizes a short code, and the
 * agent collects its own token by polling.
 */

export interface PairStartResponse {
  deviceCode: string;
  userCode: string;
  verifyUrl: string;
  expiresInS: number;
  intervalS: number;
}

export type PollOutcome =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "ready"; accountToken: string };

export interface PairOptions {
  serverUrl: string;
  fetchFn?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPrompt?: (info: PairStartResponse) => void;
}

/** A label the user will recognise when revoking a device later. */
export function deviceLabel(): string {
  return `${hostname()} (${platform()})`;
}

function base(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}

export async function startPairing(opts: PairOptions): Promise<PairStartResponse> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(`${base(opts.serverUrl)}/api/pair/start`, { method: "POST" });
  if (!res.ok) throw new Error(`pairing could not start: HTTP ${res.status}`);
  return (await res.json()) as PairStartResponse;
}

export async function pollOnce(opts: PairOptions, deviceCode: string): Promise<PollOutcome> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn(`${base(opts.serverUrl)}/api/pair/poll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceCode, label: deviceLabel() }),
  });
  if (!res.ok) throw new Error(`pairing failed: HTTP ${res.status}`);
  return (await res.json()) as PollOutcome;
}

/**
 * Run the full flow and return the agent token. Resolves only once a human has
 * authorized the code in a browser, or throws when the code expires.
 */
export async function pair(opts: PairOptions): Promise<string> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;

  const start = await startPairing(opts);
  opts.onPrompt?.(start);

  const deadline = now() + start.expiresInS * 1000;
  while (now() < deadline) {
    await sleep(start.intervalS * 1000);
    const outcome = await pollOnce(opts, start.deviceCode);
    if (outcome.status === "ready") return outcome.accountToken;
    if (outcome.status === "expired") break;
  }
  throw new Error("pairing code expired before it was authorized");
}

/** Best-effort: open the user's browser. Pairing still works if this fails. */
export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // The URL is printed to the terminal regardless.
  }
}
