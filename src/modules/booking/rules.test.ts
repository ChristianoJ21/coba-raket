import { describe, expect, it } from "vitest";
import {
  POLICY,
  canTransition,
  cancellationOutcome,
  daysLate,
  feeCreditIdr,
  isTerminal,
  isUnreturned,
  lateFeeIdr,
  priceBooking,
  scheduleFor,
} from "./rules";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const veteran = { completedOnTimeTrials: 3 };
const newcomer = { completedOnTimeTrials: 0 };

describe("priceBooking", () => {
  it("prices two Tier 1 rackets as in the PRD wireframe (Rp100k fee, Rp500k deposit)", () => {
    const r = priceBooking([{ id: "a", costIdr: 1_200_000 }, { id: "b", costIdr: 1_200_000 }], newcomer);
    expect(r).toMatchObject({ ok: true, feeIdr: 100_000, depositIdr: 500_000, totalDueIdr: 600_000 });
  });

  it("uses the deposit of each racket's own tier", () => {
    const r = priceBooking(
      [{ id: "a", costIdr: 1_000_000 }, { id: "b", costIdr: 2_000_000 }, { id: "c", costIdr: 4_000_000 }],
      veteran,
    );
    expect(r).toMatchObject({ ok: true, feeIdr: 150_000, depositIdr: 250_000 + 500_000 + 750_000 });
  });

  it("rejects Tier 3 for new customers but allows it after one on-time trial", () => {
    const tier3 = [{ id: "a", costIdr: 3_500_000 }];
    expect(priceBooking(tier3, newcomer)).toMatchObject({ ok: false, code: "TIER3_NOT_ALLOWED" });
    expect(priceBooking(tier3, { completedOnTimeTrials: 1 })).toMatchObject({ ok: true });
  });

  it("rejects empty, oversized and duplicate selections", () => {
    expect(priceBooking([], veteran)).toMatchObject({ ok: false, code: "NO_RACKETS" });
    const four = [1, 2, 3, 4].map((n) => ({ id: String(n), costIdr: 1_000_000 }));
    expect(priceBooking(four, veteran)).toMatchObject({ ok: false, code: "TOO_MANY_RACKETS" });
    expect(priceBooking([{ id: "a", costIdr: 1 }, { id: "a", costIdr: 1 }], veteran)).toMatchObject({
      ok: false,
      code: "DUPLICATE_RACKET",
    });
  });
});

describe("scheduleFor", () => {
  it("is due after 3 days and blocks one more turnaround day", () => {
    const pickup = new Date("2026-11-07T02:00:00Z");
    const s = scheduleFor(pickup);
    expect(s.dueAt.getTime() - pickup.getTime()).toBe(3 * DAY);
    expect(s.blockedUntil.getTime() - s.dueAt.getTime()).toBe(POLICY.turnaroundDays * DAY);
  });
});

describe("late and unreturned rules", () => {
  const due = new Date("2026-11-10T10:00:00Z");

  it("charges nothing when returned on or before the due time", () => {
    expect(daysLate(due, due)).toBe(0);
    expect(lateFeeIdr(due, new Date(due.getTime() - HOUR))).toBe(0);
  });

  it("rounds partial days up and scales with the number of rackets", () => {
    expect(daysLate(due, new Date(due.getTime() + HOUR))).toBe(1);
    expect(daysLate(due, new Date(due.getTime() + DAY + HOUR))).toBe(2);
    expect(lateFeeIdr(due, new Date(due.getTime() + 2 * DAY), 2)).toBe(2 * 25_000 * 2);
  });

  it("treats more than 7 days late as unreturned", () => {
    expect(isUnreturned(due, new Date(due.getTime() + 7 * DAY))).toBe(false);
    expect(isUnreturned(due, new Date(due.getTime() + 7 * DAY + 1))).toBe(true);
  });
});

describe("cancellationOutcome", () => {
  const pickup = new Date("2026-11-07T02:00:00Z");
  const paid = { feeIdr: 100_000, depositIdr: 500_000 };

  it("refunds everything at least 24 hours before pickup", () => {
    const r = cancellationOutcome(new Date(pickup.getTime() - 24 * HOUR), pickup, paid);
    expect(r).toEqual({ feeRefundIdr: 100_000, depositRefundIdr: 500_000, feeKeptIdr: 0 });
  });

  it("keeps the fee but refunds the deposit when cancelled later", () => {
    const r = cancellationOutcome(new Date(pickup.getTime() - 23 * HOUR), pickup, paid);
    expect(r).toEqual({ feeRefundIdr: 0, depositRefundIdr: 500_000, feeKeptIdr: 100_000 });
  });
});

describe("feeCreditIdr", () => {
  const returned = new Date("2026-11-10T10:00:00Z");
  it("credits the fee only when buying within 14 days", () => {
    expect(feeCreditIdr(returned, new Date(returned.getTime() + 14 * DAY), 50_000)).toBe(50_000);
    expect(feeCreditIdr(returned, new Date(returned.getTime() + 14 * DAY + 1), 50_000)).toBe(0);
  });
});

describe("booking state machine", () => {
  it("allows the happy path", () => {
    const path = ["requested", "confirmed", "active", "returned", "inspected", "settled"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows the late and dispute branches", () => {
    expect(canTransition("active", "overdue")).toBe(true);
    expect(canTransition("overdue", "returned")).toBe(true);
    expect(canTransition("overdue", "unreturned")).toBe(true);
    expect(canTransition("inspected", "disputed")).toBe(true);
    expect(canTransition("disputed", "inspected")).toBe(true);
  });

  it("forbids skipping steps and leaving terminal states", () => {
    expect(canTransition("requested", "active")).toBe(false);
    expect(canTransition("confirmed", "settled")).toBe(false);
    expect(canTransition("active", "cancelled")).toBe(false); // once picked up, cancelling is no longer possible
    expect(isTerminal("settled")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(canTransition("settled", "inspected")).toBe(false);
  });
});
