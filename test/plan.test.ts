import { describe, expect, it } from "vitest";
import { detectPlan, planBadge } from "../src/plan.js";

describe("detectPlan", () => {
  it("returns api when an API key is in the environment", () => {
    expect(
      detectPlan({ env: { ANTHROPIC_API_KEY: "sk-x" }, fileExists: () => false }),
    ).toBe("api");
  });

  it("returns declared subscription plan when only credentials exist", () => {
    // A subscription login has a credentials file but no API key file.
    const onlyCreds = (p: string) => p.endsWith(".credentials.json");
    expect(detectPlan({ env: {}, fileExists: onlyCreds })).toBe("pro"); // default
    expect(detectPlan({ env: {}, fileExists: onlyCreds, declaredPlan: "max" })).toBe("max");
  });

  it("prefers api over subscription when both present", () => {
    expect(
      detectPlan({ env: { ANTHROPIC_API_KEY: "sk" }, fileExists: () => true }),
    ).toBe("api");
  });

  it("returns unknown when nothing is detectable", () => {
    expect(detectPlan({ env: {}, fileExists: () => false })).toBe("unknown");
  });

  it("renders badges", () => {
    expect(planBadge("api")).toBe("API");
    expect(planBadge("max")).toBe("MAX");
    expect(planBadge("unknown")).toBe("—");
  });
});
