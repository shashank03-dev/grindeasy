import { describe, expect, it } from "vitest";
import { isLikelyWebhookUrl } from "../src/webhookSetup.js";

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
