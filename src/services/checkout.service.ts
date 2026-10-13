import { CheckoutStatus, EmailType, Prisma, type Checkout } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { normalizeEmail } from "../lib/email-normalize.js";
import { isPaidOrderStatus } from "../lib/order-status.js";
import { logStructured } from "../lib/logger.js";
import { upsertCustomer, toSafeCustomer } from "./customer.service.js";
import { loadEnv } from "../config/env.js";
import { recordCustomerEvent } from "./customer-event.service.js";
import { getSegmentsForCustomer } from "./segment.service.js";
import { checkEmailEligibility } from "./eligibility.service.js";
import {
  abandonmentInstant,
  planCheckoutWrite,
  planExplicitAbandon,
  planExplicitRecover,
} from "./checkout-lifecycle.js";

const STALE_CHECKOUT_BATCH = 500;

export type CreateCheckoutInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  marketingConsent?: boolean;
  externalCheckoutId: string;
  cartData: Prisma.InputJsonValue;
  totalAmount: number;
  currency: string;
};

export type CheckoutWriteResult = {
  checkout: Checkout;
  created: boolean;
};

export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutWriteResult> {
  const customer = await upsertCustomer({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    country: input.country,
    marketingConsent: input.marketingConsent,
  });

  const email = normalizeEmail(input.email);
  const currency = input.currency.toUpperCase();
  const cartData = input.cartData as Prisma.InputJsonValue;

  const apply = async (existing: Checkout | null): Promise<CheckoutWriteResult> => {
    const linkedOrder = await prisma.order.findUnique({
      where: { externalCheckoutId: input.externalCheckoutId },
    });
    const linkedOrderPaid = linkedOrder ? isPaidOrderStatus(linkedOrder.status) : false;
    const plan = planCheckoutWrite(existing, linkedOrderPaid);
    const now = new Date();

    if (plan === "keep" && existing) {
      return { checkout: existing, created: false };
    }

    if (plan === "create_active" || plan === "create_recovered") {
      const checkout = await prisma.checkout.create({
        data: {
          customerId: customer.id,
          email,
          externalCheckoutId: input.externalCheckoutId,
          cartData,
          totalAmount: input.totalAmount,
          currency,
          status: plan === "create_recovered" ? CheckoutStatus.RECOVERED : CheckoutStatus.ACTIVE,
          recoveredAt: plan === "create_recovered" ? now : null,
        },
      });
      await recordCustomerEvent({
        customerId: customer.id,
        type: "CHECKOUT_STARTED",
        metadata: { checkoutId: checkout.id, externalCheckoutId: input.externalCheckoutId },
      });
      return { checkout, created: true };
    }

    if (!existing) {
      throw new HttpError(500, "Checkout write plan missing row", "CHECKOUT_WRITE_FAILED");
    }

    const checkout = await prisma.checkout.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        email,
        cartData,
        totalAmount: input.totalAmount,
        currency,
        ...(plan === "reactivate"
          ? { status: CheckoutStatus.ACTIVE, abandonedAt: null }
          : {}),
        ...(plan === "recover"
          ? { status: CheckoutStatus.RECOVERED, recoveredAt: existing.recoveredAt ?? now }
          : {}),
      },
    });
    return { checkout, created: false };
  };

  const existing = await prisma.checkout.findUnique({
    where: { externalCheckoutId: input.externalCheckoutId },
  });

  try {
    return await apply(existing);
  } catch (err) {
    if (!isUniqueConflict(err) || existing) throw err;
    const raced = await prisma.checkout.findUnique({
      where: { externalCheckoutId: input.externalCheckoutId },
    });
    if (!raced) throw err;
    return apply(raced);
  }
}

export async function markCheckoutAbandoned(checkoutId: string): Promise<Checkout> {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  }

  const plan = planExplicitAbandon(checkout.status);
  if (plan === "noop") return checkout;
  if (plan === "recovered") {
    throw new HttpError(409, "Checkout already recovered", "CHECKOUT_RECOVERED");
  }
  if (plan === "rejected") {
    throw new HttpError(409, "Checkout cannot be abandoned", "CHECKOUT_NOT_ABANDONABLE");
  }

  const abandonedAt = new Date();
  const updated = await prisma.checkout.updateMany({
    where: { id: checkoutId, status: CheckoutStatus.ACTIVE },
    data: { status: CheckoutStatus.ABANDONED, abandonedAt },
  });
  if (updated.count === 0) {
    const current = await prisma.checkout.findUnique({ where: { id: checkoutId } });
    if (!current) throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
    if (current.status === CheckoutStatus.ABANDONED) return current;
    throw new HttpError(409, "Checkout cannot be abandoned", "CHECKOUT_NOT_ABANDONABLE");
  }

  const saved = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!saved) throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  if (saved.status === CheckoutStatus.ABANDONED) {
    await recordCustomerEvent({
      customerId: checkout.customerId,
      type: "CHECKOUT_ABANDONED",
      metadata: { checkoutId },
    });
  }
  return saved;
}

export async function markCheckoutRecovered(checkoutId: string): Promise<Checkout> {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  }
  if (planExplicitRecover(checkout.status) === "noop") return checkout;

  await prisma.checkout.updateMany({
    where: { id: checkoutId, status: { not: CheckoutStatus.RECOVERED } },
    data: { status: CheckoutStatus.RECOVERED, recoveredAt: new Date() },
  });

  const saved = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!saved) throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  return saved;
}

/**
 * Flip quiet ACTIVE checkouts to ABANDONED.
 * Conditional updateMany is safe when several instances or the agent poll and a cron overlap:
 * only the update that still sees ACTIVE wins, and only that winner records CHECKOUT_ABANDONED.
 * abandonedAt is last activity + CHECKOUT_ABANDON_AFTER_MINUTES, so a late sweep does not
 * push the email sequence further out.
 */
export async function abandonStaleCheckouts(now = new Date()): Promise<{
  abandoned: number;
  checkoutIds: string[];
}> {
  const minutes = loadEnv().CHECKOUT_ABANDON_AFTER_MINUTES;
  const cutoff = new Date(now.getTime() - minutes * 60_000);
  const stale = await prisma.checkout.findMany({
    where: { status: CheckoutStatus.ACTIVE, updatedAt: { lte: cutoff } },
    select: { id: true, customerId: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: STALE_CHECKOUT_BATCH,
  });

  const checkoutIds: string[] = [];
  for (const row of stale) {
    const abandonedAt = abandonmentInstant(row.updatedAt, minutes, now);
    const updated = await prisma.checkout.updateMany({
      where: { id: row.id, status: CheckoutStatus.ACTIVE },
      data: { status: CheckoutStatus.ABANDONED, abandonedAt },
    });
    if (updated.count !== 1) continue;
    checkoutIds.push(row.id);
    await recordCustomerEvent({
      customerId: row.customerId,
      type: "CHECKOUT_ABANDONED",
      metadata: { checkoutId: row.id, source: "auto_sweep" },
    });
  }

  if (checkoutIds.length > 0) {
    logStructured("info", "checkouts_auto_abandoned", { count: checkoutIds.length });
  }

  return { abandoned: checkoutIds.length, checkoutIds };
}

/** Stop the abandoned-checkout sequence for checkouts tied to a paid order. Already-recovered rows are left untouched. */
export async function recoverCheckoutsForPaidOrder(input: {
  customerId: string;
  externalCheckoutId?: string;
}): Promise<{ recovered: number }> {
  const where: Prisma.CheckoutWhereInput = input.externalCheckoutId
    ? {
        externalCheckoutId: input.externalCheckoutId,
        status: { in: [CheckoutStatus.ACTIVE, CheckoutStatus.ABANDONED] },
      }
    : {
        customerId: input.customerId,
        status: { in: [CheckoutStatus.ACTIVE, CheckoutStatus.ABANDONED] },
      };

  const result = await prisma.checkout.updateMany({
    where,
    data: { status: CheckoutStatus.RECOVERED, recoveredAt: new Date() },
  });
  return { recovered: result.count };
}

export async function listAbandonedCheckoutsForAgent() {
  await abandonStaleCheckouts();
  const env = loadEnv();
  const minAbandonedAt = new Date(Date.now() - env.ABANDONED_CHECKOUT_MIN_AGE_MINUTES * 60_000);

  const checkouts = await prisma.checkout.findMany({
    where: {
      status: CheckoutStatus.ABANDONED,
      abandonedAt: { lte: minAbandonedAt },
      customer: {
        unsubscribed: false,
        marketingConsent: true,
      },
    },
    include: {
      customer: true,
      emailMessages: {
        where: { type: EmailType.ABANDONED_CHECKOUT, direction: "OUTBOUND" },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { abandonedAt: "asc" },
    take: 100,
  });

  const items = [];
  for (const checkout of checkouts) {
    const eligibility = await checkEmailEligibility({
      customerId: checkout.customerId,
      recipientEmail: checkout.customer.email,
      type: EmailType.ABANDONED_CHECKOUT,
      checkoutId: checkout.id,
    });

    if (!eligibility.eligible) continue;

    const segments = await getSegmentsForCustomer(checkout.customerId);
    const recentOrder = await prisma.order.findFirst({
      where: { customerId: checkout.customerId },
      orderBy: { createdAt: "desc" },
    });

    const abandonedAt = checkout.abandonedAt ?? checkout.createdAt;
    items.push({
      checkout: {
        id: checkout.id,
        externalCheckoutId: checkout.externalCheckoutId,
        cartData: checkout.cartData,
        products: checkout.cartData,
        totalAmount: checkout.totalAmount,
        currency: checkout.currency,
        abandonedAt,
        timeSinceAbandonmentMs: Date.now() - abandonedAt.getTime(),
        status: checkout.status,
      },
      customer: toSafeCustomer(checkout.customer),
      marketingConsent: checkout.customer.marketingConsent,
      unsubscribed: checkout.customer.unsubscribed,
      customerSegment: segments,
      orderStatus: recentOrder?.status ?? null,
      previousEmails: checkout.emailMessages,
      suggestedSequence: eligibility.abandonedCheckoutSequence,
    });
  }

  return items;
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
