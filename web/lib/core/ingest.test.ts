import { describe, expect, it } from "vitest";
import {
  applyIngest,
  COMBO_BUCKET_MS,
  MAX_ELAPSED_CREDIT_MS,
  MIN_INGEST_GAP_MS,
  parsePayload,
  type IngestPayload,
} from "./ingest";

const MIN = 60_000;

function payload(overrides: Partial<IngestPayload> = {}): IngestPayload {
  return {
    version: 1,
    plan: "pro",
    toolTotalsMs: {},
    totalCombos: 0,
    agentVersion: "test",
    ...overrides,
  };
}

describe("applyIngest", () => {
  it("first ingest sets the baseline and credits nothing", () => {
    const r = applyIngest(null, payload({ toolTotalsMs: { "claude-code": 5 * MIN } }), 1000);
    expect(r.ok && r.creditedMsByTool).toEqual({});
    expect(r.ok && r.newBaseline.toolTotalsMs).toEqual({ "claude-code": 5 * MIN });
  });

  it("credits the delta between totals", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload({ toolTotalsMs: { codex: 10 * MIN } }), t0);
    if (!first.ok) throw new Error("unexpected");
    const second = applyIngest(
      first.newBaseline,
      payload({ toolTotalsMs: { codex: 13 * MIN } }),
      t0 + 5 * MIN,
    );
    expect(second.ok && second.creditedMsByTool).toEqual({ codex: 3 * MIN });
  });

  it("clamps the per-tool delta to wall-clock elapsed", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload({ toolTotalsMs: { codex: 0 } }), t0);
    if (!first.ok) throw new Error("unexpected");
    // Claims 60 minutes of activity in a 5 minute gap → credit only 5 minutes.
    const second = applyIngest(
      first.newBaseline,
      payload({ toolTotalsMs: { codex: 60 * MIN } }),
      t0 + 5 * MIN,
    );
    expect(second.ok && second.creditedMsByTool).toEqual({ codex: 5 * MIN });
  });

  it("caps elapsed credit at MAX_ELAPSED_CREDIT_MS after a long offline gap", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload({ toolTotalsMs: { codex: 0 } }), t0);
    if (!first.ok) throw new Error("unexpected");
    const dayLater = t0 + 24 * 3_600_000;
    const second = applyIngest(
      first.newBaseline,
      payload({ toolTotalsMs: { codex: 24 * 3_600_000 } }),
      dayLater,
    );
    expect(second.ok && second.creditedMsByTool).toEqual({ codex: MAX_ELAPSED_CREDIT_MS });
  });

  it("re-baselines with zero credit when totals decrease (stats reset)", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload({ toolTotalsMs: { codex: 100 * MIN } }), t0);
    if (!first.ok) throw new Error("unexpected");
    const second = applyIngest(
      first.newBaseline,
      payload({ toolTotalsMs: { codex: 2 * MIN } }),
      t0 + 5 * MIN,
    );
    expect(second.ok && second.creditedMsByTool).toEqual({});
    expect(second.ok && second.newBaseline.toolTotalsMs).toEqual({ codex: 2 * MIN });
  });

  it("clamps combo credit to the number of elapsed combo windows", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload({ totalCombos: 0 }), t0);
    if (!first.ok) throw new Error("unexpected");
    // 100 combos claimed in one 5-minute window → credit 1.
    const second = applyIngest(
      first.newBaseline,
      payload({ totalCombos: 100 }),
      t0 + COMBO_BUCKET_MS,
    );
    expect(second.ok && second.creditedCombos).toBe(1);
  });

  it("rate limits ingests closer together than MIN_INGEST_GAP_MS", () => {
    const t0 = 1_000_000;
    const first = applyIngest(null, payload(), t0);
    if (!first.ok) throw new Error("unexpected");
    const second = applyIngest(first.newBaseline, payload(), t0 + MIN_INGEST_GAP_MS - 1000);
    expect(second.ok).toBe(false);
    expect(!second.ok && second.retryAfterS).toBe(1);
  });
});

describe("parsePayload", () => {
  it("accepts a well-formed payload", () => {
    const p = parsePayload({
      version: 1,
      plan: "max",
      toolTotalsMs: { "claude-code": 1234.7 },
      totalCombos: 3,
      agentVersion: "0.2.0",
    });
    expect(p).toEqual({
      version: 1,
      plan: "max",
      toolTotalsMs: { "claude-code": 1234 },
      totalCombos: 3,
      agentVersion: "0.2.0",
    });
  });

  it("rejects wrong versions and junk", () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload({ version: 2, plan: "pro", toolTotalsMs: {} })).toBeNull();
    expect(parsePayload({ version: 1, plan: "platinum", toolTotalsMs: {} })).toBeNull();
    expect(parsePayload({ version: 1, plan: "pro", toolTotalsMs: "x" })).toBeNull();
  });

  it("drops malformed tool ids and negative/NaN values", () => {
    const p = parsePayload({
      version: 1,
      plan: "api",
      toolTotalsMs: {
        "claude-code": 100,
        "BAD ID!": 100,
        negative: -5,
        nan: Number.NaN,
      },
      totalCombos: -3,
      agentVersion: "x",
    });
    expect(p?.toolTotalsMs).toEqual({ "claude-code": 100 });
    expect(p?.totalCombos).toBe(0);
  });
});
