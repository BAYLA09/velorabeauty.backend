import { CheckoutStatus } from "@prisma/client";

export type CheckoutWritePlan =
  | "create_active"
  | "create_recovered"
  | "update_open"
  | "reactivate"
  | "recover"
  | "keep";

export function planCheckoutWrite(
  existing: { status: CheckoutStatus } | null,
  linkedOrderPaid: boolean,
): CheckoutWritePlan {
  if (!existing) {
    return linkedOrderPaid ? "create_recovered" : "create_active";
  }
  if (existing.status === CheckoutStatus.RECOVERED || existing.status === CheckoutStatus.EXPIRED) {
    return "keep";
  }
  if (linkedOrderPaid) return "recover";
  if (existing.status === CheckoutStatus.ABANDONED) return "reactivate";
  return "update_open";
}

export type ExplicitAbandonPlan = "mark" | "noop" | "recovered" | "rejected";

export function planExplicitAbandon(status: CheckoutStatus): ExplicitAbandonPlan {
  if (status === CheckoutStatus.ABANDONED) return "noop";
  if (status === CheckoutStatus.RECOVERED) return "recovered";
  if (status === CheckoutStatus.ACTIVE) return "mark";
  return "rejected";
}

export function planExplicitRecover(status: CheckoutStatus): "mark" | "noop" {
  return status === CheckoutStatus.RECOVERED ? "noop" : "mark";
}

/** True when an ACTIVE checkout has had no upsert for `abandonAfterMinutes`. */
export function isCheckoutStale(lastActivityAt: Date, abandonAfterMinutes: number, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= abandonAfterMinutes * 60_000;
}

/**
 * When the quiet period elapsed, not when the sweep happened to run.
 * Capped at `now` so a clock skew cannot schedule abandonment in the future.
 */
export function abandonmentInstant(lastActivityAt: Date, abandonAfterMinutes: number, now: Date): Date {
  const instant = lastActivityAt.getTime() + abandonAfterMinutes * 60_000;
  return new Date(Math.min(instant, now.getTime()));
}
