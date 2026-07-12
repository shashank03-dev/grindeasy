import { Client } from "@xhayper/discord-rpc";
import { planBadge } from "./plan.js";
import type { Plan, TierResult } from "./types.js";

export const REPO_URL = "https://github.com/shashank03-dev/grindeasy";

export interface PresenceState {
  activeToolNames: string[];
  tier: TierResult;
  plan: Plan;
  /** When the current active session started, or null if idle. */
  sessionStartMs: number | null;
  /**
   * Board position from the last successful sync, or null when the user hasn't
   * joined the board, sync is off, or the server is unreachable. Null renders
   * the card exactly as it looked before rank existed.
   */
  rank: number | null;
}

export interface PresenceOptions {
  clientId: string;
  donateUrl: string;
  showIdlePresence: boolean;
}

/** Builds the underlying Discord client. Injectable so the manager is testable. */
export type ClientFactory = (clientId: string) => Client;

/**
 * Wraps the Discord IPC client. Connects to the local Discord desktop app and
 * keeps the Rich Presence card in sync. All failures are non-fatal: if Discord
 * isn't running, the agent keeps tracking and retries the connection.
 */
export class PresenceManager {
  private readonly opts: PresenceOptions;
  private readonly createClient: ClientFactory;
  private client: Client | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastState: PresenceState | null = null;
  /**
   * The activity we last actually pushed (see `presenceKey`), or null before the
   * first push. Discord keeps the elapsed timer counting on its own; re-sending an
   * identical activity restarts that timer at 0:00, so we push only when the card
   * would visibly change. This is the whole reason the session timer used to reset
   * every poll while running in the background.
   */
  private lastSentKey: string | null = null;
  private stopped = false;

  constructor(
    opts: PresenceOptions,
    createClient: ClientFactory = (clientId) => new Client({ clientId }),
  ) {
    this.opts = opts;
    this.createClient = createClient;
  }

  /** Begin connecting. No-op (with a clear log) when no client id is configured. */
  start(): void {
    if (!this.opts.clientId) {
      console.warn(
        "[presence] No discordClientId set — the Discord card is disabled. " +
          "Add your Application ID to ~/.grindeasy/config.json (see README).",
      );
      return;
    }
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    const client = this.createClient(this.opts.clientId);
    this.client = client;

    client.on("ready", () => {
      this.connected = true;
      console.log("[presence] Connected to Discord.");
      // A fresh connection carries no activity, so the next push must go through
      // even if the state is identical to what we sent before the drop.
      this.lastSentKey = null;
      if (this.lastState) this.update(this.lastState);
    });
    client.on("disconnected", () => {
      this.connected = false;
      this.lastSentKey = null;
      this.scheduleReconnect();
    });

    client.login().catch(() => {
      this.connected = false;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15_000);
  }

  /** Push a new presence. Remembers the state so it can re-apply on reconnect. */
  update(state: PresenceState): void {
    this.lastState = state;
    if (!this.connected || !this.client?.user) return;
    const activity = buildActivity(state, this.opts);
    const key = presenceKey(activity);
    // Nothing the card shows has changed — leave Discord's elapsed timer running
    // rather than resetting it with a redundant update.
    if (key === this.lastSentKey) return;
    this.lastSentKey = key;
    if (!activity) {
      this.client.user.clearActivity().catch(() => {});
      return;
    }
    this.client.user.setActivity(activity).catch(() => {});
  }

  async destroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      await this.client?.destroy();
    } catch {
      // ignore teardown errors
    }
  }
}

/**
 * A stable identity for a presence payload, used to skip redundant pushes.
 * Idle (a cleared card, `null`) gets its own sentinel so it dedupes too, and
 * never collides with a real payload's JSON.
 */
export function presenceKey(activity: ReturnType<typeof buildActivity>): string {
  return activity === null ? " cleared" : JSON.stringify(activity);
}

/** Build the Discord activity payload, or null to clear the card. */
export function buildActivity(state: PresenceState, opts: PresenceOptions) {
  const isActive = state.activeToolNames.length > 0;
  if (!isActive && !opts.showIdlePresence) return null;

  const rankPrefix = state.rank !== null ? `#${state.rank} on grindeasy · ` : "";
  const tierLine = `${rankPrefix}${state.tier.glyph} ${state.tier.name} · ${planBadge(state.plan)}`;
  const details = isActive
    ? `Coding · ${state.activeToolNames.join(" + ")}`.slice(0, 128)
    : "Idle";

  const activity: Record<string, unknown> = {
    details,
    state: tierLine.slice(0, 128),
    largeImageKey: "grindeasy",
    largeImageText: "grindeasy · rank up while you ship",
    smallImageKey: state.plan === "unknown" ? undefined : state.plan,
    smallImageText: `${planBadge(state.plan)} plan`,
    buttons: [
      { label: "⚡ Get grindeasy", url: REPO_URL },
      { label: "☕ Support", url: opts.donateUrl },
    ],
  };
  if (isActive && state.sessionStartMs) {
    activity.startTimestamp = state.sessionStartMs;
  }
  return activity;
}
