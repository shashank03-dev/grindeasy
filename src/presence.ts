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

/**
 * Wraps the Discord IPC client. Connects to the local Discord desktop app and
 * keeps the Rich Presence card in sync. All failures are non-fatal: if Discord
 * isn't running, the agent keeps tracking and retries the connection.
 */
export class PresenceManager {
  private readonly opts: PresenceOptions;
  private client: Client | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastState: PresenceState | null = null;
  private stopped = false;

  constructor(opts: PresenceOptions) {
    this.opts = opts;
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
    const client = new Client({ clientId: this.opts.clientId });
    this.client = client;

    client.on("ready", () => {
      this.connected = true;
      console.log("[presence] Connected to Discord.");
      if (this.lastState) this.update(this.lastState);
    });
    client.on("disconnected", () => {
      this.connected = false;
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
    largeImageText: "grindeasy · vibe & climb",
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
