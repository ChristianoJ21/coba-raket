import { describe, expect, it } from "vitest";
import { isTrialEligible, racketFromRow, tierForValue, type RacketRow } from "./rules";

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
