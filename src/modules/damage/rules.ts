/** Damage and dispute rules (PRD section 7.3, 7.4, DMG-1 to DMG-6). Pure functions only. */

export type DamageGrade = "normal_wear" | "string_break" | "deep_chip" | "structural";

export const DEEP_CHIP_CHARGE_IDR = 100_000;
export const DISPUTE_WINDOW_HOURS = 48;

/**
 * Customer charge for a grade. Normal wear and string breaks are never charged.
 * Structural damage charges the agreed value shown in the booking, less resale value.
 */
export function chargeFor(
  grade: DamageGrade,
  structural?: { agreedValueIdr: number; resaleValueIdr: number },
): number {
  switch (grade) {
    case "normal_wear":
    case "string_break":
      return 0;
    case "deep_chip":
      return DEEP_CHIP_CHARGE_IDR;
    case "structural": {
      if (!structural) throw new Error("Structural damage needs the agreed value and resale value.");
      return Math.max(0, structural.agreedValueIdr - structural.resaleValueIdr);
    }
  }
}

export interface ChargeEvidence {
  returnPhotoCount: number;
  reason: string;
  /** True when the pickup photos clearly show the area in question (DMG-5). */
  pickupPhotosClearOnArea: boolean;
}

export type ChargeCheck = { ok: true } | { ok: false; reasons: string[] };

/** A charge may be saved only with a return photo and a reason, and only if pickup photos show the area. */
export function canSaveCharge(chargeIdr: number, evidence: ChargeEvidence): ChargeCheck {
  if (chargeIdr <= 0) return { ok: true };
  const reasons: string[] = [];
  if (evidence.returnPhotoCount < 1) reasons.push("At least one return photo is required.");
  if (evidence.reason.trim().length === 0) reasons.push("A written reason is required.");
  if (!evidence.pickupPhotosClearOnArea) reasons.push("Pickup photos do not clearly show this area, so it cannot be charged.");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** DMG-6: cracked or bent rackets leave the trial catalogue. */
export function shouldRetire(grade: DamageGrade): boolean {
  return grade === "structural";
}

export function isWithinDisputeWindow(inspectedAt: Date, now: Date): boolean {
  return now.getTime() - inspectedAt.getTime() <= DISPUTE_WINDOW_HOURS * 60 * 60 * 1000;
}
