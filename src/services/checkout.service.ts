import { CheckoutStatus, type Checkout, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { normalizeEmail } from "../lib/email-normalize.js";
import { upsertCustomer } from "./customer.service.js";
import { loadEnv } from "../config/env.js";

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

  return prisma.checkout.upsert({
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
}

export async function markCheckoutAbandoned(checkoutId: string): Promise<Checkout> {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    throw new HttpError(404, "Checkout not found", "CHECKOUT_NOT_FOUND");
  }
  if (checkout.status === CheckoutStatus.RECOVERED) {
    throw new HttpError(409, "Checkout already recovered", "CHECKOUT_RECOVERED");
  }

  return prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.ABANDONED,
      abandonedAt: checkout.abandonedAt ?? new Date(),
    },
  });
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
  const emailCooldownSince = new Date(Date.now() - env.ABANDONED_CHECKOUT_COOLDOWN_HOURS * 60 * 60_000);

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
        where: {
          type: "ABANDONED_CHECKOUT",
          direction: "OUTBOUND",
          createdAt: { gte: emailCooldownSince },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { abandonedAt: "asc" },
    take: 100,
  });

  return checkouts
    .filter((c) => c.emailMessages.length === 0)
    .map((checkout) => ({
      checkout: {
        id: checkout.id,
        externalCheckoutId: checkout.externalCheckoutId,
        cartData: checkout.cartData,
        totalAmount: checkout.totalAmount,
        currency: checkout.currency,
        abandonedAt: checkout.abandonedAt,
        status: checkout.status,
      },
      customer: {
        id: checkout.customer.id,
        email: checkout.customer.email,
        firstName: checkout.customer.firstName,
        lastName: checkout.customer.lastName,
        marketingConsent: checkout.customer.marketingConsent,
        unsubscribed: checkout.customer.unsubscribed,
      },
      previousEmails: checkout.emailMessages.map((m) => ({
        id: m.id,
        subject: m.subject,
        type: m.type,
        status: m.status,
        sentAt: m.sentAt,
        createdAt: m.createdAt,
      })),
    }));
}
