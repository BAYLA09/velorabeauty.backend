import { CheckoutStatus, EmailType, type Checkout, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { normalizeEmail } from "../lib/email-normalize.js";
import { upsertCustomer, toSafeCustomer } from "./customer.service.js";
import { loadEnv } from "../config/env.js";
import { recordCustomerEvent } from "./customer-event.service.js";
import { getSegmentsForCustomer } from "./segment.service.js";
import { checkEmailEligibility } from "./eligibility.service.js";

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

export async function createCheckout(input: CreateCheckoutInput): Promise<Checkout> {
  const customer = await upsertCustomer({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    country: input.country,
    marketingConsent: input.marketingConsent,
  });

  const email = normalizeEmail(input.email);

  const checkout = await prisma.checkout.upsert({
    where: { externalCheckoutId: input.externalCheckoutId },
    create: {
      customerId: customer.id,
      email,
      externalCheckoutId: input.externalCheckoutId,
      cartData: input.cartData as Prisma.InputJsonValue,
      totalAmount: input.totalAmount,
      currency: input.currency.toUpperCase(),
      status: CheckoutStatus.ACTIVE,
    },
    update: {
      cartData: input.cartData as Prisma.InputJsonValue,
      totalAmount: input.totalAmount,
      currency: input.currency.toUpperCase(),
      email,
    },
  });

  await recordCustomerEvent({
    customerId: customer.id,
    type: "CHECKOUT_STARTED",
    metadata: { checkoutId: checkout.id, externalCheckoutId: input.externalCheckoutId },
  });

  return checkout;
}

export async function markCheckoutAbandoned(checkoutId: string): Promise<Checkout> {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  }
  if (checkout.status === CheckoutStatus.RECOVERED) {
    throw new HttpError(409, "Checkout already recovered", "CHECKOUT_RECOVERED");
  }

  const updated = await prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.ABANDONED,
      abandonedAt: checkout.abandonedAt ?? new Date(),
    },
  });

  await recordCustomerEvent({
    customerId: checkout.customerId,
    type: "CHECKOUT_ABANDONED",
    metadata: { checkoutId },
  });

  return updated;
}

export async function markCheckoutRecovered(checkoutId: string): Promise<Checkout> {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  }

  return prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.RECOVERED,
      recoveredAt: new Date(),
    },
  });
}

export async function listAbandonedCheckoutsForAgent() {
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
