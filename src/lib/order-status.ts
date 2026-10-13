const PAID_ORDER_STATUSES = new Set(["paid", "complete", "completed", "succeeded"]);

/** Card capture and equivalent storefront statuses. Pending / awaiting_payment / cod are not paid. */
export function isPaidOrderStatus(status: string): boolean {
  return PAID_ORDER_STATUSES.has(status.trim().toLowerCase());
}
