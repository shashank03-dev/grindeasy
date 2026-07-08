import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./db.js";
import type { Env } from "./env.js";
import { oauthConfigured } from "./env.js";
import { cookie, parseCookies, readBody, redirect, sendHtml, sendJson } from "./http.js";
import { applyIngest, parsePayload } from "./ingest.js";
import { rankBoard } from "./leaderboard.js";
import { authorizeUrl, displayName, exchangeCode, fetchDiscordUser } from "./oauth.js";
import { renderLanding, renderMe, renderMessage } from "./pages.js";

const SESSION_COOKIE = "vr_session";
const STATE_COOKIE = "vr_oauth_state";

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
        sendJson(res, 200, {
          ok: true,
          creditedMsByTool: result.creditedMsByTool,
          creditedCombos: result.creditedCombos,
        });
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
        redirect(res, authorizeUrl(env.discordClientId, redirectUri, state), [
          cookie(STATE_COOKIE, state, { maxAgeS: 600, secure }),
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
        redirect(res, "/me", [
          cookie(SESSION_COOKIE, session, { maxAgeS: 30 * 86_400, secure }),
          cookie(STATE_COOKIE, "", { maxAgeS: 0, secure }),
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
