/**
 * Booking rules (PRD sections 6.3 and 7). Pure functions only.
 * All money is an integer number of rupiah. All amounts are PROPOSED policy values
 * (PRD section 7) and live in one place so they are easy to change after the demand test.
 */
import { tierForValue, type Tier } from "@/modules/catalogue";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const POLICY = {
  trialFeeIdr: 50_000, // per racket, for one 3-day trial
  trialDays: 3,
  turnaroundDays: 1, // blocked after the due date for cleaning and inspection
  lateFeePerDayIdr: 25_000, // per racket
  unreturnedAfterDays: 7,
  freeCancelHours: 24,
  feeCreditDays: 14, // trial fee is credited if the customer buys within this window
  maxRacketsPerBooking: 3,
} as const;

export const DEPOSIT_BY_TIER: Record<Tier, number> = { 1: 250_000, 2: 500_000, 3: 750_000 };

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
/** Fee and deposit for one racket, for display before booking (PAY-1). */
export function trialPriceFor(costIdr: number): { tier: Tier; feeIdr: number; depositIdr: number } {
  const tier = tierForValue(costIdr);
  return { tier, feeIdr: POLICY.trialFeeIdr, depositIdr: DEPOSIT_BY_TIER[tier] };
}

export type RuleFailure =
  | { ok: false; code: "NO_RACKETS" | "TOO_MANY_RACKETS" | "DUPLICATE_RACKET" | "TIER3_NOT_ALLOWED"; message: string };

export interface PricedBooking {
  ok: true;
  feeIdr: number;
  depositIdr: number;
  totalDueIdr: number;
  items: { racketId: string; tier: Tier; feeIdr: number; depositIdr: number }[];
}

export function priceBooking(
  rackets: { id: string; costIdr: number }[],
  customer: { completedOnTimeTrials: number },
): PricedBooking | RuleFailure {
  if (rackets.length === 0) return { ok: false, code: "NO_RACKETS", message: "Choose at least one racket." };
  if (rackets.length > POLICY.maxRacketsPerBooking) {
    return { ok: false, code: "TOO_MANY_RACKETS", message: `At most ${POLICY.maxRacketsPerBooking} rackets per booking.` };
  }
  if (new Set(rackets.map((r) => r.id)).size !== rackets.length) {
    return { ok: false, code: "DUPLICATE_RACKET", message: "The same racket was chosen twice." };
  }

  const items = rackets.map((r) => {
    const tier = tierForValue(r.costIdr);
    return { racketId: r.id, tier, feeIdr: POLICY.trialFeeIdr, depositIdr: DEPOSIT_BY_TIER[tier] };
  });

  // PRD 7.1: new customers cannot book Tier 3 until one trial is completed on time.
  if (customer.completedOnTimeTrials < 1 && items.some((i) => i.tier === 3)) {
    return { ok: false, code: "TIER3_NOT_ALLOWED", message: "Tier 3 rackets unlock after one on-time trial." };
  }

  const feeIdr = items.reduce((sum, i) => sum + i.feeIdr, 0);
  const depositIdr = items.reduce((sum, i) => sum + i.depositIdr, 0);
  return { ok: true, feeIdr, depositIdr, totalDueIdr: feeIdr + depositIdr, items };
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
export interface Schedule {
  pickupAt: Date;
  dueAt: Date;
  /** The racket is unavailable for other bookings from pickupAt until this moment (exclusive). */
  blockedUntil: Date;
}

export function scheduleFor(pickupAt: Date): Schedule {
  const dueAt = new Date(pickupAt.getTime() + POLICY.trialDays * DAY_MS);
  const blockedUntil = new Date(dueAt.getTime() + POLICY.turnaroundDays * DAY_MS);
  return { pickupAt, dueAt, blockedUntil };
}

// ---------------------------------------------------------------------------
// Late, unreturned and cancellation rules
// ---------------------------------------------------------------------------
/** Whole days late, rounded up, per racket. Zero when returned on time. */
export function daysLate(dueAt: Date, returnedAt: Date): number {
  const diff = returnedAt.getTime() - dueAt.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

export function lateFeeIdr(dueAt: Date, returnedAt: Date, racketCount = 1): number {
  return daysLate(dueAt, returnedAt) * POLICY.lateFeePerDayIdr * racketCount;
}

/** PRD 7.2: more than 7 days late counts as unreturned. */
export function isUnreturned(dueAt: Date, now: Date): boolean {
  return now.getTime() - dueAt.getTime() > POLICY.unreturnedAfterDays * DAY_MS;
}

export interface CancellationOutcome {
  feeRefundIdr: number;
  depositRefundIdr: number;
  feeKeptIdr: number;
}

/** PRD 7.2: free at least 24h before pickup; after that the fee is kept and the deposit refunded. */
export function cancellationOutcome(
  now: Date,
  pickupAt: Date,
  paid: { feeIdr: number; depositIdr: number },
): CancellationOutcome {
  const free = pickupAt.getTime() - now.getTime() >= POLICY.freeCancelHours * HOUR_MS;
  return free
    ? { feeRefundIdr: paid.feeIdr, depositRefundIdr: paid.depositIdr, feeKeptIdr: 0 }
    : { feeRefundIdr: 0, depositRefundIdr: paid.depositIdr, feeKeptIdr: paid.feeIdr };
}

/** The trial fee is credited in full when the customer buys within 14 days of the return. */
export function feeCreditIdr(returnedAt: Date, purchaseAt: Date, feePaidIdr: number): number {
  const withinWindow = purchaseAt.getTime() - returnedAt.getTime() <= POLICY.feeCreditDays * DAY_MS;
  return withinWindow ? feePaidIdr : 0;
}

// ---------------------------------------------------------------------------
// State machine (PRD Figure 5)
// ---------------------------------------------------------------------------
export type BookingStatus =
  | "requested" | "confirmed" | "active" | "returned" | "inspected" | "settled"
  | "cancelled" | "overdue" | "disputed" | "unreturned";

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["returned", "overdue"],
  overdue: ["returned", "unreturned"],
  // Extension beyond Figure 5: a racket recovered after being marked unreturned re-enters at "returned".
  unreturned: ["returned"],
  returned: ["inspected"],
  inspected: ["settled", "disputed"],
  disputed: ["inspected"], // a reviewer's decision sends it back to inspected, then it settles
  settled: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: BookingStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
