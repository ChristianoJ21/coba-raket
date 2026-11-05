import { describe, expect, it } from "vitest";
import { catalogueQuery, racketCode } from "./validation";

describe("catalogueQuery", () => {
  it("treats empty form fields as no filter", () => {
    expect(catalogueQuery.parse({ level: "", maxWeight: "", grip: "", budget: "" })).toEqual({});
  });
  it("coerces numbers from the query string", () => {
    expect(catalogueQuery.parse({ level: "beginner", maxWeight: "285", grip: "L2", budget: "2000000" })).toEqual({
      level: "beginner",
      maxWeight: 285,
      grip: "L2",
      budget: 2_000_000,
    });
  });
  it("rejects values outside the allowed set", () => {
    expect(catalogueQuery.safeParse({ level: "pro" }).success).toBe(false);
    expect(catalogueQuery.safeParse({ maxWeight: "9999" }).success).toBe(false);
    expect(catalogueQuery.safeParse({ grip: "<script>" }).success).toBe(false);
  });
});

describe("racketCode", () => {
  it("normalises case and rejects odd characters", () => {
    expect(racketCode.parse(" r-004 ")).toBe("R-004");
    expect(racketCode.safeParse("R-004;drop").success).toBe(false);
  });
});
