/**
 * Ledger rules (PRD PAY-4, PAY-5). Pure functions only.
 * Ledger rows are append-only and always store a POSITIVE amount; the direction comes from `kind`.
 * Every balance is rebuilt from rows with `summarize`, never stored.
 */

export type LedgerKind =
  | "trial_fee" // customer paid the trial fee
  | "deposit_hold" // customer paid the refundable deposit
  | "deposit_release" // deposit (or part of it) returned to the customer
  | "late_fee" // charged against the deposit
  | "damage_charge" // charged against the deposit
  | "purchase_credit" // trial fee credited toward buying the racket
  | "refund"; // trial fee returned to the customer (e.g. free cancellation)

export interface LedgerRow {
  kind: LedgerKind;
  amountIdr: number;
}

export interface LedgerSummary {
  feePaidIdr: number;
  feeRefundedIdr: number;
  feeKeptIdr: number; // fee paid, less refunds and purchase credit
  purchaseCreditIdr: number;
  depositHeldIdr: number;
  chargesIdr: number; // late fees + damage charges
  depositReleasedIdr: number;
  /** Deposit still owed back to the customer right now. Never negative. */
  refundDueIdr: number;
  /** Charges that exceed the deposit and must be claimed separately. */
  shortfallIdr: number;
  /** True when more deposit was released than was ever allowed. This must trigger an alert. */
  overReleased: boolean;
}

export function summarize(rows: readonly LedgerRow[]): LedgerSummary {
  const sum = (kind: LedgerKind) =>
    rows.filter((r) => r.kind === kind).reduce((total, r) => total + r.amountIdr, 0);

  const feePaidIdr = sum("trial_fee");
  const feeRefundedIdr = sum("refund");
  const purchaseCreditIdr = sum("purchase_credit");
  const depositHeldIdr = sum("deposit_hold");
  const chargesIdr = sum("late_fee") + sum("damage_charge");
  const depositReleasedIdr = sum("deposit_release");

  const releasable = Math.max(0, depositHeldIdr - chargesIdr);
  return {
    feePaidIdr,
    feeRefundedIdr,
    feeKeptIdr: feePaidIdr - feeRefundedIdr - purchaseCreditIdr,
    purchaseCreditIdr,
    depositHeldIdr,
    chargesIdr,
    depositReleasedIdr,
    refundDueIdr: Math.max(0, releasable - depositReleasedIdr),
    shortfallIdr: Math.max(0, chargesIdr - depositHeldIdr),
    overReleased: depositReleasedIdr > releasable,
  };
}

/** Stable idempotency key so a retried request or duplicate webhook cannot post twice. */
export function ledgerKey(bookingId: string, kind: LedgerKind, reference: string): string {
  return `${bookingId}:${kind}:${reference}`;
}

export function assertValidAmount(amountIdr: number): void {
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    throw new RangeError(`Ledger amounts must be positive whole rupiah, got ${amountIdr}`);
  }
}
