/**
 * Payment adapter. MVP: manual QRIS, where the operator confirms the transfer by hand (PRD PAY-2).
 * Later, a licensed gateway implements the same interface and calls the webhook handler.
 */
export interface ChargeRequest {
  bookingId: string;
  amountIdr: number;
}

export interface ChargeInstructions {
  /** Unique reference the customer should include; also used as the ledger idempotency reference. */
  reference: string;
  /** Plain-language instructions shown to the customer. */
  instructions: string;
}

export interface PaymentAdapter {
  createCharge(request: ChargeRequest): Promise<ChargeInstructions>;
}

/** Manual QRIS: no gateway call. Payment is confirmed later by an operator action. */
export function createManualQris(): PaymentAdapter {
  return {
    async createCharge({ bookingId, amountIdr }) {
      const reference = `QRIS-${bookingId.slice(0, 8)}`;
      return {
        reference,
        instructions: `Transfer Rp${amountIdr.toLocaleString("id-ID")} via QRIS and send the proof to the operator. Reference: ${reference}.`,
      };
    },
  };
}
