# "Add to Slack" OAuth webhook connect

## Problem

Turning on the Slack weekly recap currently requires each user to create their own
Slack Incoming Webhook by hand and paste the URL (shipped in 0.8.0). That manual
step is the main adoption barrier, and it doesn't scale to "other users." Slack's
own answer is an OAuth app: the user clicks "Add to Slack," picks a channel, and
Slack generates the webhook for them — no manual creation, no copy-paste.

Verified against Slack docs (docs.slack.dev):

- A webhook URL is "specific to a single user and a single channel", so there is no
  shared grindeasy-owned webhook that could post to everyone's channel. The URL must
  be minted per user.
- Enabling **public distribution** (an unlisted shareable install link) is
  self-service — complete the checklist, click "Activate Public Distribution." Only a
  **Slack Marketplace listing** needs Slack's human review, which we do not need.
- Authorize: `https://slack.com/oauth/v2/authorize` with `client_id`,
  `scope=incoming-webhook`, `redirect_uri` (https), `state`.
- Exchange: `POST https://slack.com/api/oauth.v2.access` with `code`, `client_id`,
  `client_secret`, `redirect_uri`.
- Success response: `ok:true`, `team.name`, and
  `incoming_webhook.{url, channel, channel_id, configuration_url}`.
- Failure: `ok:false` + `error`.

## Decisions (locked)

- **Local agent posts**, exactly as today. The server only brokers the OAuth handoff
  and passes the generated webhook back to the agent; it never stores webhooks and
  never posts. Keeps the "nothing goes through grindeasy's servers" property and
  needs no server-side token storage or scheduler.
- **No grindeasy account required** to connect Slack. The webhook is independent of
  the leaderboard (as it already is in config).
- **Approach A — dedicated Slack-connect broker**, mirroring the existing device
  pairing flow (`pairRequests` + `/api/pair/*` + `/pair`), kept separate from the
  token-minting path.
- **Manual paste stays** as a fallback: needed for self-hosted Slack-compatible
  endpoints (Mattermost, etc.) and for servers where the Slack app isn't configured.

## Architecture

Two codes per connect attempt, mirroring pairing's deviceCode/userCode split:

- `agentCode` (secret) — the agent polls with it; never in the browser.
- `stateCode` — travels in the connect URL and as the OAuth `state`; the browser and
  Slack see only this.

The webhook is delivered only to the holder of `agentCode`, so exposure of the
browser URL (`stateCode`) never leaks the webhook.

### Flow

1. `grindeasy webhook` → `p.select`: **Connect Slack (opens browser)** ·
   **Paste a webhook URL** · **Cancel**.
2. Connect Slack → agent `POST /api/slack/start` → `{agentCode, connectUrl,
   expiresInS, intervalS}`; agent opens the browser to `connectUrl`, also prints it,
   shows a "waiting…" spinner, and polls.
3. `/slack/connect?code=<stateCode>` renders one "Add to Slack" button linking to the
   Slack authorize URL (`scope=incoming-webhook`, `state=stateCode`,
   `redirect_uri=${baseUrl}/api/slack/callback`). User picks a channel on Slack.
4. Slack → `GET /api/slack/callback?code&state` → exchange via `oauth.v2.access` →
   store `incoming_webhook.url`, `incoming_webhook.channel`, `team.name` on the row →
   browser redirected to `/slack/connect/done` ("Connected — return to your
   terminal").
5. Agent poll returns `{status:"ready", webhookUrl, channel, teamName}` → agent shows
   "Posts to `#channel` in *Workspace* — save?" `p.confirm` → on yes, save to
   `config.slackWebhookUrl` and attempt one test post.

## Components

### Web (`web/`)

- **schema** (`lib/db/schema.ts`): new `slackConnections` table, modeled on
  `pairRequests`:
  - `agentCode` text primary key (secret)
  - `stateCode` text not null unique (browser/OAuth state)
  - `webhookUrl` text (null until callback success)
  - `channel` text (null until success)
  - `teamName` text (null until success)
  - `error` text (null unless the callback failed/denied)
  - `createdAt` timestamptz default now
  - `expiresAt` timestamptz not null
  - `consumedAt` timestamptz (single-use delivery guard)
  - index on `stateCode`
- **migration**: `drizzle-kit generate` produces the SQL + snapshot; the existing
  `scripts/migrate-on-deploy.mjs` applies it on the next production deploy.
- **queries** (`lib/db/queries.ts`):
  - `createSlackConnection(db, ttlMs)` → `{agentCode, stateCode}`
  - `findLiveSlackConnection(db, stateCode, now?)` → row (unexpired, unconsumed) | null
  - `storeSlackWebhook(db, stateCode, {webhookUrl, channel, teamName}, now?)` → bool
    (guarded on live + not yet stored)
  - `failSlackConnection(db, stateCode, error, now?)` → void
  - `consumeSlackConnection(db, agentCode, now?)` → `SlackConnectOutcome`
    (`pending` | `expired` | `error{reason}` | `ready{webhookUrl,channel,teamName}`),
    single-use via `consumed_at IS NULL` guarded UPDATE (copied semantics from
    `consumePairRequest`)
- **`lib/slack.ts`** (new):
  - `buildAuthorizeUrl({clientId, redirectUri, state})` → string
  - `exchangeSlackCode({clientId, clientSecret, redirectUri, code, fetchFn?})` →
    `{ok:true, webhookUrl, channel, teamName}` | `{ok:false, error}`
- **`lib/env.ts`**: add `slackClientId`, `slackClientSecret`; `slackConfigured(env)`.
- **routes / pages**:
  - `POST /api/slack/start` → 503 when `!slackConfigured`; else create row, return
    `{agentCode, connectUrl, expiresInS, intervalS}`.
  - `GET /api/slack/callback` → validate `state` row is live; on `error` param or
    missing `code` → `failSlackConnection` + redirect `/slack/connect/done?error=1`;
    else `exchangeSlackCode`; on ok → `storeSlackWebhook` + redirect done; on !ok →
    `failSlackConnection` + redirect done with error.
  - `POST /api/slack/poll` → `consumeSlackConnection(agentCode)`.
  - `/slack/connect` page → reads `?code=stateCode`; live row → "Add to Slack"
    button; otherwise a branded "start from your terminal" notice (mirrors `/pair`).
  - `/slack/connect/done` page → success or error message ("return to your
    terminal").

### Agent (`src/`)

- **`src/slackConnect.ts`** (new), mirroring `pair.ts`:
  - `startSlackConnect(opts)` → `POST /api/slack/start`; a 503 throws a typed
    `SlackNotConfiguredError` so the caller falls back to paste.
  - `pollSlackOnce(opts, agentCode)` → outcome.
  - `connectSlack(opts)` → run the loop (start → openBrowser + print → poll until
    ready/error/expired); returns `{webhookUrl, channel, teamName}` or throws.
- **`src/webhookSetup.ts`** (extend): `runWebhookSetup(config)` opens with the
  `p.select`. Connect Slack → `connectSlack`, then the target-channel confirm, then
  save + test post (webhook saved even if the test post fails, since it's Slack
  issued); `SlackNotConfiguredError` → inline note + fall through to the paste flow.
  Paste → the existing `isLikelyWebhookUrl` + test-post flow. `isLikelyWebhookUrl`
  stays.
- **`src/onboarding.ts`** / **`src/index.ts`**: unchanged in shape — they already
  call `runWebhookSetup`; it just presents more choices now.

## Error handling

Every failure mode resolves to a defined, non-dead-end state:

- Server unconfigured → 503 → paste fallback.
- Browser won't open → URL printed; manual open.
- User denies → `error=access_denied` → row failed → agent stops with a clear
  message.
- Timeout/expiry → 10-min TTL → agent reports timeout; nothing saved.
- Exchange `ok:false` → row failed with Slack's error; nothing saved.
- Test post fails on an OAuth webhook → saved anyway with a warning.
- Injected webhook via leaked `stateCode` → the agent's "Posts to #X in *Workspace*?"
  confirm surfaces the unfamiliar target; `stateCode` is high-entropy, single-use,
  10-min TTL.
- Connect page with no/expired code → branded notice.
- Double poll → one-time consume guard.
- Non-TTY → existing config-edit hint (0.8.0).

## Testing

- Web queries: create/find/store/fail/consume, expiry, single-use (extend
  `web/lib/db/queries.test.ts`).
- `web/lib/slack.ts`: `exchangeSlackCode` ok/error/denial and `buildAuthorizeUrl`
  shape, mocked fetch.
- `web/lib/env.ts`: `slackConfigured` (extend `env.test.ts`).
- Agent `src/slackConnect.ts`: poll loop reaches ready; expired throws; error
  outcome; 503 → `SlackNotConfiguredError` (injected fetch + sleep, mirroring
  `test/pair.test.ts`).
- The clack `select`/`confirm` interaction is not unit-tested (consistent with
  `onboarding.ts`).

## Maintainer prerequisite (not code)

The flow is inert until, once:

1. Create a Slack app at api.slack.com/apps.
2. Add the `incoming-webhook` bot scope.
3. Set the Redirect URL to `https://grindeasy.tech/api/slack/callback`.
4. Add `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` to Vercel (production).
5. Under Manage Distribution, complete the checklist and click "Activate Public
   Distribution."

Until then, `/api/slack/start` returns 503 and the agent uses the paste flow, so
shipping this ahead of the Slack app registration breaks nothing.

## Out of scope

- Server-side posting / a scheduler (explicitly rejected — agent posts).
- Storing webhooks server-side or per-account.
- Slack Marketplace listing.
- Any change to how/when the recap is composed or posted (the 0.7.0 notifier).
