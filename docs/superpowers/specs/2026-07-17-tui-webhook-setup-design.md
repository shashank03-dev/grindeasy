# TUI webhook setup

## Problem

The Slack webhook notifier (0.7.0) is real but effectively hidden: the only way to
turn it on is to hand-edit `slackWebhookUrl` in `~/.grindeasy/config.json`. Almost
nobody will do that. We want the setup to happen inside the terminal UI, both for
new users during onboarding and for people already running an older install.

## Design

One shared interactive routine, reached two ways.

**`src/webhookSetup.ts` (new)**
- `isLikelyWebhookUrl(url): boolean` — pure, exported for tests. True only when the
  trimmed string parses as a URL with an `https:` protocol. Nothing Slack-specific;
  self-hosted Slack-compatible endpoints (Mattermost, etc.) are valid too.
- `runWebhookSetup(config): Promise<boolean>` — the shared clack routine:
  1. `p.text` prompts for the URL, validating non-empty + `isLikelyWebhookUrl`
     (Esc skips).
  2. If the host isn't `hooks.slack.com`, warn but continue (self-hosted is fine).
  3. Live-test with the existing `postSlackMessage` (a short "connected" message).
  4. On success: persist via `updateConfig({ slackWebhookUrl })`, mutate `config`,
     report saved. On failure: save nothing, tell the user to re-run
     `grindeasy webhook`.

  No `p.intro`/`p.outro` — it runs both inside the onboarding clack flow and as a
  standalone command.

**`src/onboarding.ts`**
- New `offerWebhook(config)` step, called after `offerServiceInstall` in
  `runOnboarding`, run unconditionally (the webhook doesn't depend on a leaderboard
  token). Guarded once-only by a new `askedAboutWebhook` flag set before the
  question (same pattern as `askedToJoinBoard`). `p.confirm` defaults to No; Yes
  runs `runWebhookSetup`.
- `needsOnboarding` gains `webhookPending = !askedAboutWebhook && !slackWebhookUrl`,
  so existing users get the one-time re-prompt. TTY-gated as today.

**`src/config.ts`** — add `askedAboutWebhook: boolean` to `Config` and
`DEFAULT_CONFIG` (`false`).

**`src/index.ts`**
- `grindeasy webhook` (no arg) → `runWebhookSetup` (errors out with a config-edit
  hint when there's no TTY).
- `grindeasy webhook test` → unchanged (re-post to the configured URL).
- Help text updated for the `webhook` line.

## Testing

Unit-test `isLikelyWebhookUrl` (accept https Slack + https self-hosted, reject
http/garbage/empty, tolerate whitespace). The clack interaction isn't unit-tested,
matching the rest of `onboarding.ts`.

## Out of scope

No change to how or when the weekly recap posts (that's the 0.7.0 notifier). This is
purely the setup surface.
