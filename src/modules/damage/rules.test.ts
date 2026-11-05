import { describe, expect, it } from "vitest";
import { canSaveCharge, chargeFor, isWithinDisputeWindow, shouldRetire } from "./rules";

const goodEvidence = { returnPhotoCount: 2, reason: "Deep chip on the top of the frame", pickupPhotosClearOnArea: true };

describe("chargeFor", () => {
  it("never charges normal wear or string breaks", () => {
    expect(chargeFor("normal_wear")).toBe(0);
    expect(chargeFor("string_break")).toBe(0);
  });

  it("charges a fixed Rp100,000 for a deep chip", () => {
    expect(chargeFor("deep_chip")).toBe(100_000);
  });

  it("charges agreed value less resale for structural damage, never below zero", () => {
    expect(chargeFor("structural", { agreedValueIdr: 1_200_000, resaleValueIdr: 500_000 })).toBe(700_000);
    expect(chargeFor("structural", { agreedValueIdr: 400_000, resaleValueIdr: 500_000 })).toBe(0);
    expect(() => chargeFor("structural")).toThrow();
  });
});

describe("canSaveCharge", () => {
  it("allows a zero charge without evidence", () => {
    expect(canSaveCharge(0, { returnPhotoCount: 0, reason: "", pickupPhotosClearOnArea: false })).toEqual({ ok: true });
  });

  it("allows a charge with a return photo, a reason and clear pickup photos", () => {
    expect(canSaveCharge(100_000, goodEvidence)).toEqual({ ok: true });
  });

  it("lists every missing piece of evidence", () => {
    const r = canSaveCharge(100_000, { returnPhotoCount: 0, reason: "  ", pickupPhotosClearOnArea: false });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reasons).toHaveLength(3);
  });
});

describe("retirement and disputes", () => {
  it("retires only structural damage", () => {
    expect(shouldRetire("structural")).toBe(true);
    expect(shouldRetire("deep_chip")).toBe(false);
  });

  it("allows disputes for 48 hours after inspection", () => {
    const inspected = new Date("2026-11-10T10:00:00Z");
    expect(isWithinDisputeWindow(inspected, new Date("2026-11-12T10:00:00Z"))).toBe(true);
    expect(isWithinDisputeWindow(inspected, new Date("2026-11-12T10:00:01Z"))).toBe(false);
  });
});
