import type { Plan } from "./types";

/**
 * Display-only half of the agent's src/plan.ts. Plan *detection* stays on the
 * agent, where it can look at the local filesystem; the server only ever
 * receives an already-decided plan string and renders a badge for it.
 */

export const PLANS: readonly Plan[] = ["api", "pro", "max", "unknown"];

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
