/** Admin and dispute-review rules (PRD DMG-4). Pure functions only. */

/**
 * A dispute may be decided only by a staff member who was not involved in the booking,
 * so the person who recorded the grade can never review their own decision.
 */
export function canReviewDispute(
  reviewer: { id: string; role: "customer" | "operator" | "admin" },
  booking: { customerId: string; operatorIds: readonly string[] },
): boolean {
  if (reviewer.role === "customer") return false;
  if (reviewer.id === booking.customerId) return false;
  return !booking.operatorIds.includes(reviewer.id);
}
