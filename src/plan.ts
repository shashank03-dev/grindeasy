import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plan } from "./types.js";

export interface PlanDetectionInputs {
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** What a subscription user declared at onboarding. Trusted as-is. */
  declaredPlan?: "pro" | "max";
  /** Injectable for tests. */
  fileExists?: (path: string) => boolean;
}

/**
 * Derive the plan badge. We only ever check for the *presence* of an API key or
 * of a subscription credential file — we never read, log, or transmit the
 * secret itself.
 *
 * - An API key in the environment => "api" (provable).
 * - A Claude subscription login (credentials file) => the user's declared
 *   Pro/Max, trusted as declared. Defaults to "pro" when undeclared.
 * - Nothing detectable => "unknown".
 */
export function detectPlan(inputs: PlanDetectionInputs = {}): Plan {
  const env = inputs.env ?? process.env;
  const home = inputs.home ?? homedir();
  const exists = inputs.fileExists ?? existsSync;

  if (env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || exists(join(home, ".claude", "api_key"))) {
    return "api";
  }

  const hasSubscription =
    exists(join(home, ".claude", ".credentials.json")) ||
    exists(join(home, ".claude.json")) ||
    exists(join(home, ".config", "claude", ".credentials.json"));

  if (hasSubscription) {
    return inputs.declaredPlan === "max" ? "max" : "pro";
  }

  return "unknown";
}

/** Short uppercase badge for display, e.g. "MAX". */
export function planBadge(plan: Plan): string {
  switch (plan) {
    case "api":
      return "API";
    case "pro":
      return "PRO";
    case "max":
      return "MAX";
    default:
      return "—";
  }
}
