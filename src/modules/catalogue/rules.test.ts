import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  filterRackets,
  isTrialEligible,
  nextFreeAt,
  parseTstzRange,
  racketFromRow,
  tierForValue,
  type CatalogueFilters,
  type Period,
  type PlayerLevel,
  type RacketRow,
} from "./rules";

const row: RacketRow = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "R-001",
  brand: "Wilson",
  model: "Tour Slam Lite",
  head_size_sq_in: 105,
  weight_g: 265,
  grip_size: "L2",
  string_pattern: "16x19",
  level_fit: ["beginner", "expert", "intermediate"],
  condition_grade: "good",
  status: "ready",
  cost_idr: 784_000,
  sale_price_idr: null,
};

describe("racketFromRow", () => {
  it("maps database columns to the domain type", () => {
    const racket = racketFromRow(row);
    expect(racket).toMatchObject({ code: "R-001", headSizeSqIn: 105, weightG: 265, gripSize: "L2", costIdr: 784_000 });
  });

  it("drops level values it does not know instead of guessing", () => {
    expect(racketFromRow(row).levelFit).toEqual(["beginner", "intermediate"]);
  });
});

describe("tierForValue", () => {
  it("uses the PRD 7.2 boundaries", () => {
    expect(tierForValue(1_499_999)).toBe(1);
    expect(tierForValue(1_500_000)).toBe(2);
    expect(tierForValue(3_000_000)).toBe(2);
    expect(tierForValue(3_000_001)).toBe(3);
  });
});

describe("isTrialEligible", () => {
  it("rejects rackets that are out, in service or retired", () => {
    expect(isTrialEligible({ status: "ready", conditionGrade: "good" })).toBe(true);
    for (const status of ["reserved", "out", "servicing", "retired", "sold"] as const) {
      expect(isTrialEligible({ status, conditionGrade: "good" })).toBe(false);
    }
    expect(isTrialEligible({ status: "ready", conditionGrade: "retired" })).toBe(false);
  });
});

describe("parseTstzRange", () => {
  it("parses the PostgREST text form", () => {
    const p = parseTstzRange('["2026-11-07 02:00:00+00","2026-11-11 10:00:00+00")');
    expect(p?.start.toISOString()).toBe("2026-11-07T02:00:00.000Z");
    expect(p?.end.toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });
  it("handles offsets with minutes and unquoted bounds", () => {
    expect(parseTstzRange("[2026-11-07T09:00:00+07:00,2026-11-08T09:00:00+07:00)")?.start.toISOString()).toBe(
      "2026-11-07T02:00:00.000Z",
    );
  });
  it("returns null for empty, unbounded or garbage ranges", () => {
    expect(parseTstzRange("empty")).toBeNull();
    expect(parseTstzRange('["2026-11-07 02:00:00+00",)')).toBeNull();
    expect(parseTstzRange("nonsense")).toBeNull();
  });
});

const d = (iso: string) => new Date(iso);
const period = (s: string, e: string): Period => ({ start: d(s), end: d(e) });

describe("nextFreeAt", () => {
  const now = d("2026-11-06T00:00:00Z");
  it("is now when nothing overlaps", () => {
    expect(nextFreeAt([], now)).toEqual(now);
    expect(nextFreeAt([period("2026-11-10T00:00:00Z", "2026-11-14T00:00:00Z")], now)).toEqual(now);
    expect(nextFreeAt([period("2026-11-01T00:00:00Z", "2026-11-05T00:00:00Z")], now)).toEqual(now);
  });
  it("jumps to the end of the period covering now", () => {
    expect(nextFreeAt([period("2026-11-05T00:00:00Z", "2026-11-09T00:00:00Z")], now)).toEqual(d("2026-11-09T00:00:00Z"));
  });
  it("chains back-to-back periods in any order", () => {
    const periods = [period("2026-11-09T00:00:00Z", "2026-11-13T00:00:00Z"), period("2026-11-05T00:00:00Z", "2026-11-09T00:00:00Z")];
    expect(nextFreeAt(periods, now)).toEqual(d("2026-11-13T00:00:00Z"));
  });
  it("stops at the first gap", () => {
    const periods = [period("2026-11-05T00:00:00Z", "2026-11-09T00:00:00Z"), period("2026-11-10T00:00:00Z", "2026-11-14T00:00:00Z")];
    expect(nextFreeAt(periods, now)).toEqual(d("2026-11-09T00:00:00Z"));
  });
});

describe("availabilityOf", () => {
  const now = d("2026-11-06T00:00:00Z");
  const busy = [period("2026-11-05T00:00:00Z", "2026-11-09T00:00:00Z")];
  it("is available now for a ready racket with no current booking", () => {
    expect(availabilityOf({ status: "ready", conditionGrade: "good" }, [], now)).toEqual({ kind: "now" });
  });
  it("shows the next free date for a racket out on a trial", () => {
    expect(availabilityOf({ status: "out", conditionGrade: "good" }, busy, now)).toEqual({ kind: "from", at: d("2026-11-09T00:00:00Z") });
  });
  it("gives no date for a racket in servicing", () => {
    expect(availabilityOf({ status: "servicing", conditionGrade: "good" }, busy, now)).toEqual({ kind: "unavailable", status: "servicing" });
  });
  it("is unavailable when out but the booking already ended (not yet returned)", () => {
    expect(availabilityOf({ status: "out", conditionGrade: "good" }, [], now)).toEqual({ kind: "unavailable", status: "out" });
  });
});

describe("filterRackets", () => {
  const rs = [
    { id: "a", levelFit: ["beginner"] as PlayerLevel[], weightG: 265, gripSize: "L2", costIdr: 800_000 },
    { id: "b", levelFit: ["intermediate"] as PlayerLevel[], weightG: 285, gripSize: "L3", costIdr: 2_400_000 },
    { id: "c", levelFit: ["beginner", "intermediate"] as PlayerLevel[], weightG: 300, gripSize: "L2", costIdr: 3_900_000 },
  ];
  const ids = (f: CatalogueFilters) => filterRackets(rs, f).map((r) => r.id);
  it("returns everything with no filters", () => expect(ids({})).toEqual(["a", "b", "c"]));
  it("filters by each field", () => {
    expect(ids({ level: "beginner" })).toEqual(["a", "c"]);
    expect(ids({ maxWeightG: 285 })).toEqual(["a", "b"]);
    expect(ids({ grip: "L3" })).toEqual(["b"]);
    expect(ids({ maxBudgetIdr: 2_400_000 })).toEqual(["a", "b"]);
  });
  it("combines filters with AND", () => expect(ids({ level: "beginner", grip: "L2", maxWeightG: 290 })).toEqual(["a"]));
});
