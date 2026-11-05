import { describe, expect, it } from "vitest";
import { canReviewDispute } from "./rules";

const booking = { customerId: "cust", operatorIds: ["op1"] };

describe("canReviewDispute", () => {
  it("allows an uninvolved operator or admin", () => {
    expect(canReviewDispute({ id: "op2", role: "operator" }, booking)).toBe(true);
    expect(canReviewDispute({ id: "adm", role: "admin" }, booking)).toBe(true);
  });

  it("blocks the operator who handled the booking", () => {
    expect(canReviewDispute({ id: "op1", role: "operator" }, booking)).toBe(false);
  });

  it("blocks customers, including the booking's own customer", () => {
    expect(canReviewDispute({ id: "cust", role: "customer" }, booking)).toBe(false);
    expect(canReviewDispute({ id: "other", role: "customer" }, booking)).toBe(false);
  });
});
