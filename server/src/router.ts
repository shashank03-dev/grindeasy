import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./db.js";
import type { Env } from "./env.js";
import { oauthConfigured } from "./env.js";
import { cookie, parseCookies, readBody, redirect, sendHtml, sendJson } from "./http.js";
import { applyIngest, parsePayload } from "./ingest.js";
import { rankBoard, rankOf } from "./leaderboard.js";
import { authorizeUrl, displayName, exchangeCode, fetchDiscordUser } from "./oauth.js";
import { renderLanding, renderMe, renderMessage, renderPair } from "./pages.js";

const SESSION_COOKIE = "vr_session";
const STATE_COOKIE = "vr_oauth_state";
/** Where to land after login, so pairing survives the OAuth round trip. */
const NEXT_COOKIE = "vr_next";

/** How long a pairing code is good for. Short: it's a live handshake, not a token. */
export const PAIR_TTL_MS = 10 * 60_000;
/** How often we ask the agent to poll. */
export const PAIR_INTERVAL_S = 5;

/** Only ever redirect within this site — never to a URL an attacker supplied. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export interface RouterDeps {
  store: Store;
  env: Env;
  /** Injectable clock + fetch for tests. */
  now?: () => number;
  fetchFn?: typeof fetch;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function createHandler(deps: RouterDeps): Handler {
  const { store, env } = deps;
  const now = deps.now ?? Date.now;
  const fetchFn = deps.fetchFn ?? fetch;
  const secure = env.baseUrl.startsWith("https://");
  const redirectUri = `${env.baseUrl}/auth/callback`;

  function sessionUser(req: IncomingMessage) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    return token ? store.getSessionUser(token) : null;
  }

  return async function handle(req, res) {
    const url = new URL(req.url ?? "/", env.baseUrl);
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/") {
        sendHtml(res, 200, renderLanding(rankBoard(store.boardRows()), sessionUser(req) !== null));
        return;
      }

      if (req.method === "GET" && path === "/healthz") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && path === "/api/leaderboard") {
        sendJson(res, 200, { entries: rankBoard(store.boardRows()) });
        return;
      }

      if (req.method === "POST" && path === "/api/ingest") {
        const auth = req.headers.authorization ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        const record = token ? store.getAgentToken(token) : null;
        if (!record) {
          sendJson(res, 401, { ok: false, error: "invalid token" });
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, { ok: false, error: "invalid JSON" });
          return;
        }
        const payload = parsePayload(body);
        if (!payload) {
          sendJson(res, 400, { ok: false, error: "invalid payload" });
          return;
        }
        const result = applyIngest(record.baseline, payload, now());
        if (!result.ok) {
          res.setHeader("retry-after", String(result.retryAfterS));
          sendJson(res, 429, { ok: false, error: "rate limited", retryAfterS: result.retryAfterS });
          return;
        }
        for (const [toolId, ms] of Object.entries(result.creditedMsByTool)) {
          store.creditTool(record.userId, toolId, ms);
        }
        store.addCombos(record.userId, result.creditedCombos);
        store.setPlan(record.userId, payload.plan);
        store.saveBaseline(token, result.newBaseline);

        // The agent's card shows live rank, so it rides back on the sync the
        // agent already makes — no extra request, no polling.
        const user = store.getUserById(record.userId);
        const standing = user ? rankOf(store.boardRows(), user.discordId) : null;

        sendJson(res, 200, {
          ok: true,
          creditedMsByTool: result.creditedMsByTool,
          creditedCombos: result.creditedCombos,
          rank: standing?.rank ?? null,
          totalPlayers: standing?.totalPlayers ?? null,
        });
        return;
      }

      // --- Device pairing -------------------------------------------------
      // The agent never sees the user's Discord credentials, and the user never
      // copies a token: the agent holds a secret device code, the human
      // authorizes a short user code in a browser, and the agent collects its
      // own token by polling.

      if (req.method === "POST" && path === "/api/pair/start") {
        store.purgeExpiredDeviceCodes(now());
        const record = store.createDeviceCode(now(), PAIR_TTL_MS);
        sendJson(res, 200, {
          deviceCode: record.deviceCode,
          userCode: record.userCode,
          verifyUrl: `${env.baseUrl}/pair?code=${encodeURIComponent(record.userCode)}`,
          expiresInS: Math.floor(PAIR_TTL_MS / 1000),
          intervalS: PAIR_INTERVAL_S,
        });
        return;
      }

      if (req.method === "POST" && path === "/api/pair/poll") {
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, { status: "expired" });
          return;
        }
        const deviceCode = (body as { deviceCode?: unknown }).deviceCode;
        if (typeof deviceCode !== "string" || !deviceCode) {
          sendJson(res, 400, { status: "expired" });
          return;
        }

        // The agent sends a device label. There is one stable agent token per
        // user and no per-device revocation yet, so there is nothing to attach
        // it to — accepted and ignored rather than stored unused.
        const claim = store.claimDeviceCode(deviceCode, now());
        if (claim.status === "ready") {
          sendJson(res, 200, {
            status: "ready",
            accountToken: store.getOrCreateAgentToken(claim.userId),
          });
          return;
        }
        sendJson(res, 200, { status: claim.status });
        return;
      }

      if (req.method === "GET" && path === "/pair") {
        const code = url.searchParams.get("code") ?? "";
        const user = sessionUser(req);
        if (!user) {
          // Come back here once they've logged in, code and all.
          redirect(res, `/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);
          return;
        }
        sendHtml(res, 200, renderPair(user, code));
        return;
      }

      if (req.method === "POST" && path === "/pair") {
        const user = sessionUser(req);
        if (!user) {
          redirect(res, "/auth/login?next=%2Fpair");
          return;
        }
        const form = new URLSearchParams(await readBody(req));
        const code = (form.get("code") ?? "").trim().toUpperCase();
        const pending = store.getDeviceCodeByUserCode(code, now());
        if (!pending || pending.consumed || !store.approveDeviceCode(code, user.id, now())) {
          sendHtml(res, 400, renderPair(user, code, "That code is wrong, already used, or expired."));
          return;
        }
        sendHtml(
          res,
          200,
          renderMessage(
            "Device paired",
            "Your agent is linked. Head back to your terminal — it's already counting.",
          ),
        );
        return;
      }

      if (req.method === "GET" && path === "/auth/login") {
        if (!oauthConfigured(env)) {
          sendHtml(
            res,
            503,
            renderMessage(
              "Login unavailable",
              "This server has no Discord OAuth credentials configured (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).",
            ),
          );
          return;
        }
        const state = randomBytes(16).toString("hex");
        const next = safeNext(url.searchParams.get("next"));
        redirect(res, authorizeUrl(env.discordClientId, redirectUri, state), [
          cookie(STATE_COOKIE, state, { maxAgeS: 600, secure }),
          ...(next ? [cookie(NEXT_COOKIE, next, { maxAgeS: 600, secure })] : []),
        ]);
        return;
      }

      if (req.method === "GET" && path === "/auth/callback") {
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
        if (!code || !state || !expected || state !== expected) {
          sendHtml(res, 400, renderMessage("Login failed", "OAuth state mismatch — try again."));
          return;
        }
        const accessToken = await exchangeCode(
          {
            clientId: env.discordClientId,
            clientSecret: env.discordClientSecret,
            redirectUri,
            code,
          },
          fetchFn,
        );
        const discordUser = await fetchDiscordUser(accessToken, fetchFn);
        const user = store.upsertUser(discordUser.id, displayName(discordUser), discordUser.avatar);
        const session = store.createSession(user.id);
        const next = safeNext(parseCookies(req.headers.cookie)[NEXT_COOKIE] ?? null);
        redirect(res, next ?? "/me", [
          cookie(SESSION_COOKIE, session, { maxAgeS: 30 * 86_400, secure }),
          cookie(STATE_COOKIE, "", { maxAgeS: 0, secure }),
          cookie(NEXT_COOKIE, "", { maxAgeS: 0, secure }),
        ]);
        return;
      }

      if (req.method === "GET" && path === "/logout") {
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        if (token) store.deleteSession(token);
        redirect(res, "/", [cookie(SESSION_COOKIE, "", { maxAgeS: 0, secure })]);
        return;
      }

      if (req.method === "GET" && path === "/me") {
        const user = sessionUser(req);
        if (!user) {
          redirect(res, "/auth/login");
          return;
        }
        const agentToken = store.getOrCreateAgentToken(user.id);
        sendHtml(res, 200, renderMe(user, agentToken, store.userToolTotals(user.id), env.baseUrl));
        return;
      }

      sendHtml(res, 404, renderMessage("Not found", "That page doesn't exist."));
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[server] ${req.method} ${path} failed: ${message}`);
      if (!res.headersSent) {
        if (path.startsWith("/api/")) sendJson(res, 500, { ok: false, error: "internal error" });
        else sendHtml(res, 500, renderMessage("Something went wrong", "Internal error — try again."));
      } else {
        res.end();
      }
    }
  };
}
