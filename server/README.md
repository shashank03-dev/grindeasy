# grindboard-server

The hosted half of grindboard: Discord login, stats ingest with anti-cheat
clamping, and the global leaderboard site. **Zero runtime dependencies** — just
Node ≥ 22.5 (`node:http` + `node:sqlite`).

## Run locally

```bash
cd server
npm install
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... npm start
# → http://localhost:8787
```

Without Discord credentials the board and `/api/ingest` still work; only
`/auth/login` is disabled.

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `BASE_URL` | `http://localhost:$PORT` | Public URL, used for OAuth redirects and cookie security |
| `DISCORD_CLIENT_ID` | — | From your Discord application (OAuth2 tab) |
| `DISCORD_CLIENT_SECRET` | — | Same page — keep it secret |
| `DB_PATH` | `./grindboard.db` | SQLite file (use a persistent volume in production) |

## Discord application setup

1. <https://discord.com/developers/applications> → your grindboard app → **OAuth2**.
2. Add a redirect: `BASE_URL/auth/callback` (e.g. `https://grindboard.fly.dev/auth/callback`).
3. Copy the Client ID and Client Secret into the env vars above.

The same Discord application can serve both the Rich Presence card and this
OAuth login.

## Endpoints

| Route | What |
|---|---|
| `GET /` | Landing page + global leaderboard |
| `GET /auth/login` → `/auth/callback` | Discord OAuth (scope: `identify` only) |
| `GET /me` | Profile, personal stats, **agent link token** |
| `POST /api/ingest` | Agent sync (Bearer agent token). Responds with the caller's `rank` and `totalPlayers` |
| `GET /api/leaderboard` | Board as JSON |
| `POST /api/pair/start` | Agent begins pairing → `{deviceCode, userCode, verifyUrl}` |
| `POST /api/pair/poll` | Agent collects its token → `{status: pending\|expired\|ready, accountToken?}` |
| `GET /pair` → `POST /pair` | Human approves a user code (login required) |
| `GET /healthz` | Liveness |

## Pairing

Nobody copies a token by hand. The agent holds a secret **device code** and shows
the human a short **user code**; the human approves that code in a browser while
logged in; the agent polls and collects its own token. Same shape as `gh auth
login` or `docker login`.

Codes live 10 minutes and are burned on collection, so a leaked device code
can't be replayed — a second poll reports `expired`, exactly as an unknown or
timed-out code does.

## Anti-cheat

Ingest accepts cumulative totals and credits only clamped deltas:

- one ingest per minute per token (429 otherwise),
- per-tool credit ≤ wall-clock time since that token's last ingest (capped at 6 h),
- combo credit ≤ elapsed 5-minute windows,
- totals that decrease (stats reset) re-baseline with zero credit,
- first ingest of a token credits nothing — it only sets the baseline.

So a client claiming 900 hours gets credited at most real elapsed time, same
as an honest one. One board, plan shown as a badge, never as a multiplier.

## Deploy (Docker)

```bash
# from the repo root
docker build -f server/Dockerfile -t grindboard-server .
docker run -p 8787:8787 -v grindboard-data:/data \
  -e BASE_URL=https://your.domain \
  -e DISCORD_CLIENT_ID=... -e DISCORD_CLIENT_SECRET=... grindboard-server
```

Works as-is on Fly.io (`fly launch`, mount a volume at `/data`), Render,
Railway, or any VPS. TLS is expected at `BASE_URL` (cookies are `Secure` when
it's https).
