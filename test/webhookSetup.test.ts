import { describe, expect, it } from "vitest";
import { connectConfirmMessage, isLikelyWebhookUrl } from "../src/webhookSetup.js";

describe("isLikelyWebhookUrl", () => {
  it("accepts an https Slack webhook URL", () => {
    expect(isLikelyWebhookUrl("https://hooks.slack.com/services/T00/B00/xyz")).toBe(true);
  });

  it("accepts any other https URL (self-hosted Slack-compatible endpoints)", () => {
    expect(isLikelyWebhookUrl("https://mattermost.example.com/hooks/abc")).toBe(true);
  });

  it("rejects a non-https URL", () => {
    expect(isLikelyWebhookUrl("http://hooks.slack.com/services/x")).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(isLikelyWebhookUrl("not a url")).toBe(false);
    expect(isLikelyWebhookUrl("")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isLikelyWebhookUrl("  https://hooks.slack.com/services/x  ")).toBe(true);
  });
});

describe("connectConfirmMessage", () => {
  const webhook = { channel: "#standup", teamName: "Acme Corp" };

  it("names the destination on a fresh setup", () => {
    expect(connectConfirmMessage(webhook, false)).toBe(
      "Post your weekly recap to #standup in Acme Corp?",
    );
  });

  it("says the current webhook is being replaced when one exists", () => {
    const message = connectConfirmMessage(webhook, true);
    // The whole point of the fix: saving is destructive, so the word has to be
    // there. Naming the destination is not enough — it reads as a fresh setup.
    expect(message).toContain("Replace your current Slack webhook");
    expect(message).toContain("#standup in Acme Corp");
  });
});
