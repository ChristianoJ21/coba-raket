import { describe, expect, it } from "vitest";
import { assertValidAmount, ledgerKey, summarize, type LedgerRow } from "./rules";

const paid: LedgerRow[] = [
  { kind: "trial_fee", amountIdr: 100_000 },
  { kind: "deposit_hold", amountIdr: 500_000 },
];

describe("summarize", () => {
  it("returns the full deposit when there are no charges", () => {
    const s = summarize(paid);
    expect(s).toMatchObject({ feeKeptIdr: 100_000, depositHeldIdr: 500_000, refundDueIdr: 500_000, shortfallIdr: 0 });
  });

  it("deducts late fees and damage charges from the refund", () => {
    const s = summarize([...paid, { kind: "late_fee", amountIdr: 50_000 }, { kind: "damage_charge", amountIdr: 100_000 }]);
    expect(s.chargesIdr).toBe(150_000);
    expect(s.refundDueIdr).toBe(350_000);
  });

  it("goes to zero once the refund is released", () => {
    const s = summarize([...paid, { kind: "deposit_release", amountIdr: 500_000 }]);
    expect(s.refundDueIdr).toBe(0);
    expect(s.overReleased).toBe(false);
  });

  it("reports a shortfall when charges exceed the deposit", () => {
    const s = summarize([...paid, { kind: "damage_charge", amountIdr: 900_000 }]);
    expect(s).toMatchObject({ refundDueIdr: 0, shortfallIdr: 400_000 });
  });

  it("flags over-release so it can raise an alert", () => {
    const s = summarize([...paid, { kind: "late_fee", amountIdr: 100_000 }, { kind: "deposit_release", amountIdr: 500_000 }]);
    expect(s.overReleased).toBe(true);
  });

  it("treats a credit toward purchase as no longer kept by the business as fee income", () => {
    const s = summarize([...paid, { kind: "purchase_credit", amountIdr: 50_000 }]);
    expect(s).toMatchObject({ purchaseCreditIdr: 50_000, feeKeptIdr: 50_000 });
  });

  it("returns the fee and keeps nothing after a free cancellation", () => {
    const s = summarize([...paid, { kind: "refund", amountIdr: 100_000 }]);
    expect(s.feeKeptIdr).toBe(0);
  });
});

describe("ledger helpers", () => {
  it("builds a stable idempotency key", () => {
    expect(ledgerKey("b1", "trial_fee", "qris-123")).toBe("b1:trial_fee:qris-123");
  });

  it("rejects zero, negative and fractional amounts", () => {
    for (const bad of [0, -1, 10.5, Number.NaN]) expect(() => assertValidAmount(bad)).toThrow(RangeError);
    expect(() => assertValidAmount(1)).not.toThrow();
  });
});
