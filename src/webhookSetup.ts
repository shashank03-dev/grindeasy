import * as p from "@clack/prompts";
import { updateConfig, type Config } from "./config.js";
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
 * Shared interactive Slack webhook setup, used by both first-run onboarding and
 * the `grindeasy webhook` command. Prompts for the URL, sends a live test post,
 * and only saves the URL if that post succeeds — so a half-configured webhook is
 * never persisted. Returns true when a URL was saved. Emits no intro/outro so it
 * composes inside the onboarding clack flow and stands alone as a command.
 */
export async function runWebhookSetup(config: Config): Promise<boolean> {
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
