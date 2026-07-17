import { describe, expect, it } from "vitest";
import { dayKeyUtc, isoWeekDaysUtc, isoWeekRangeUtc } from "./week";

const at = (iso: string) => Date.parse(iso);

describe("dayKeyUtc", () => {
  it("is the UTC calendar day, not the local one", () => {
    // 23:30 UTC on the 16th is still the 16th regardless of viewer timezone.
    expect(dayKeyUtc(at("2026-07-16T23:30:00Z"))).toBe("2026-07-16");
    expect(dayKeyUtc(at("2026-07-16T00:00:00Z"))).toBe("2026-07-16");
  });
});

describe("isoWeekDaysUtc", () => {
  it("returns Monday→Sunday of the week containing the day", () => {
    // 2026-07-16 is a Thursday.
    expect(isoWeekDaysUtc(at("2026-07-16T12:00:00Z"))).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
    ]);
  });

  it("keeps Sunday in the week that just ended, and Monday starting the next", () => {
    const sunday = isoWeekDaysUtc(at("2026-07-19T23:59:00Z"));
    const monday = isoWeekDaysUtc(at("2026-07-20T00:00:00Z"));
    expect(sunday[0]).toBe("2026-07-13");
    expect(monday[0]).toBe("2026-07-20");
  });

  it("spans a year boundary correctly", () => {
    // 2027-01-01 is a Friday; its week starts Mon 2026-12-28.
    const days = isoWeekDaysUtc(at("2027-01-01T00:00:00Z"));
    expect(days[0]).toBe("2026-12-28");
    expect(days[6]).toBe("2027-01-03");
  });
});

describe("isoWeekRangeUtc", () => {
  it("exposes the inclusive start/end plus the seven days", () => {
    const week = isoWeekRangeUtc(at("2026-07-16T12:00:00Z"));
    expect(week.start).toBe("2026-07-13");
    expect(week.end).toBe("2026-07-19");
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe(week.start);
    expect(week.days[6]).toBe(week.end);
  });
});
