import * as p from "@clack/prompts";
import { updateConfig, type Config } from "./config.js";
import { connectSlack, openBrowser, SlackNotConfiguredError } from "./slackConnect.js";
import { postSlackMessage } from "./webhook.js";
import * as t from "./theme.js";

/** Posted during setup so the user sees grindeasy reach their channel right away. */
const SETUP_TEST_MESSAGE =
  "*grindeasy* — webhook connected. Your weekly recap will post here at the start of each week.";

/**
 * A light sanity check on a pasted webhook URL: it must parse and be https. Not
 * Slack-specific on purpose — self-hosted Slack-compatible endpoints (Mattermost
 * and friends) accept the same `{text}` payload, so anything over https is allowed
 * and the live test post is what actually proves the URL works.
 */
export function isLikelyWebhookUrl(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The confirm shown once Slack has minted a webhook. Setup overwrites whatever is
 * already configured, so when a webhook exists the prompt has to say *replace*:
 * otherwise it reads like a fresh setup question and a working webhook is lost
 * without the user ever being told one was there.
 */
export function connectConfirmMessage(
  webhook: { channel: string; teamName: string },
  replacing: boolean,
): string {
  const destination = `${webhook.channel} in ${webhook.teamName}`;
  return replacing
    ? `Replace your current Slack webhook and post your weekly recap to ${destination} instead?`
    : `Post your weekly recap to ${destination}?`;
}

/**
 * Shared interactive Slack webhook setup, used by both first-run onboarding and
 * the `grindeasy webhook` command. Returns true when a URL was saved. Emits no
 * intro/outro so it composes inside the onboarding clack flow and stands alone as
 * a command.
 */
export async function runWebhookSetup(config: Config): Promise<boolean> {
  // Both paths below overwrite unconditionally, so say so before the choice is
  // made rather than after the browser trip, when it is easy to have forgotten.
  const replacing = Boolean(config.slackWebhookUrl?.trim());
  if (replacing) {
    p.log.warn("A Slack webhook is already configured — setting up a new one replaces it.");
  }

  // Without a server there is nobody to broker the OAuth handoff, so the choice
  // would be a menu of one.
  if (!config.serverUrl) return runPasteSetup(config);

  const choice = await p.select({
    message: "How do you want to connect Slack?",
    options: [
      { value: "connect", label: "Add to Slack", hint: "opens your browser, pick a channel" },
      { value: "paste", label: "Paste a webhook URL", hint: "or a Mattermost-style endpoint" },
      { value: "cancel", label: "Not now" },
    ],
  });
  if (p.isCancel(choice) || choice === "cancel") return false;
  if (choice === "paste") return runPasteSetup(config);

  const connected = await runConnectSetup(config, replacing);
  if (connected !== "unconfigured") return connected === "saved";

  // This server has no Slack app, which is not the user's problem to debug.
  p.log.info(t.dim("This server has no Slack app set up — you can paste a webhook URL instead."));
  return runPasteSetup(config);
}

type ConnectResult = "saved" | "failed" | "unconfigured";

/** The "Add to Slack" OAuth flow: Slack mints the webhook, we just collect it. */
async function runConnectSetup(config: Config, replacing: boolean): Promise<ConnectResult> {
  const spin = p.spinner();
  let waiting = false;

  let webhook;
  try {
    webhook = await connectSlack({
      serverUrl: config.serverUrl,
      onPrompt: (info) => {
        p.note(info.connectUrl, "Finish in your browser");
        openBrowser(info.connectUrl);
        waiting = true;
        spin.start("Waiting for you to pick a channel in Slack");
      },
    });
  } catch (err) {
    if (err instanceof SlackNotConfiguredError) return "unconfigured";
    if (waiting) spin.stop(t.dim("Slack connect stopped."));
    p.log.warn(
      `${err instanceof Error ? err.message : String(err)} — nothing saved. Re-run \`grindeasy webhook\` to try again.`,
    );
    return "failed";
  }
  spin.stop("Slack connected.");

  // The webhook arrived over a link that briefly lived in a browser, so name the
  // destination before writing it: an unfamiliar channel here is the one visible
  // sign that something other than this terminal finished the install.
  const ok = await p.confirm({
    message: connectConfirmMessage(webhook, replacing),
  });
  if (p.isCancel(ok) || !ok) {
    p.log.info(t.dim("Nothing saved."));
    return "failed";
  }

  // Slack issued this URL seconds ago, so save it first: a failed test post is
  // worth a warning, not a reason to throw away a good webhook.
  updateConfig({ slackWebhookUrl: webhook.webhookUrl });
  config.slackWebhookUrl = webhook.webhookUrl;

  const testSpin = p.spinner();
  testSpin.start("Sending a test message");
  const result = await postSlackMessage(webhook.webhookUrl, SETUP_TEST_MESSAGE);
  if (!result.ok) {
    testSpin.stop(t.dim("Test message failed."));
    p.log.warn(`${result.error} — the webhook is saved anyway; \`grindeasy webhook test\` retries.`);
    return "saved";
  }
  testSpin.stop("Test message posted.");
  p.log.success(t.phosphor("Slack webhook saved — your weekly recap will post automatically."));
  return "saved";
}

/**
 * Paste an existing webhook URL. Sends a live test post and only saves the URL if
 * that post succeeds, so a half-configured webhook is never persisted.
 */
async function runPasteSetup(config: Config): Promise<boolean> {
  const entry = await p.text({
    message: "Paste your Slack Incoming Webhook URL",
    placeholder: "https://hooks.slack.com/services/…",
    validate: (value) => {
      const v = (value ?? "").trim();
      if (!v) return "Enter a URL, or press Esc to skip.";
      if (!isLikelyWebhookUrl(v)) return "That needs to be an https:// URL.";
      return undefined;
    },
  });
  if (p.isCancel(entry)) return false;

  const url = entry.trim();
  if (!/(^|\.)hooks\.slack\.com$/i.test(new URL(url).hostname)) {
    p.log.warn(
      t.dim("Not a hooks.slack.com URL — continuing (self-hosted Slack-compatible endpoints work too)."),
    );
  }

  const spin = p.spinner();
  spin.start("Sending a test message");
  const result = await postSlackMessage(url, SETUP_TEST_MESSAGE);
  if (!result.ok) {
    spin.stop(t.dim("Test message failed."));
    p.log.warn(`${result.error} — nothing saved. Re-run \`grindeasy webhook\` to try again.`);
    return false;
  }
  spin.stop("Test message posted.");

  updateConfig({ slackWebhookUrl: url });
  config.slackWebhookUrl = url;
  p.log.success(t.phosphor("Slack webhook saved — your weekly recap will post automatically."));
  return true;
}
