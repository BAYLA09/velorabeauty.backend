import type { Customer } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isValidEmail, normalizeEmail } from "../lib/email-normalize.js";

export type UpsertCustomerInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  marketingConsent?: boolean;
};

export async function upsertCustomer(input: UpsertCustomerInput): Promise<Customer> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new HttpError(400, "Invalid email address", "INVALID_EMAIL");
  }

  const existing = await prisma.customer.findUnique({ where: { email } });
  const now = new Date();
  const marketingConsent = input.marketingConsent ?? existing?.marketingConsent ?? false;

  if (!existing) {
    return prisma.customer.create({
      data: {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        country: input.country,
        marketingConsent,
        marketingConsentAt: marketingConsent ? now : null,
      },
    });
  }

  return prisma.customer.update({
    where: { id: existing.id },
    data: {
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      phone: input.phone ?? existing.phone,
      country: input.country ?? existing.country,
      ...(input.marketingConsent !== undefined
        ? {
            marketingConsent,
            marketingConsentAt: marketingConsent ? now : existing.marketingConsentAt,
          }
        : {}),
    },
  });
}

export async function findCustomerByEmail(emailParam: string): Promise<Customer | null> {
  const email = normalizeEmail(emailParam);
  return prisma.customer.findUnique({ where: { email } });
}

export async function getCustomerById(id: string): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
  return customer;
}

export function toSafeCustomer(customer: Customer) {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    country: customer.country,
    marketingConsent: customer.marketingConsent,
    marketingConsentAt: customer.marketingConsentAt,
    unsubscribed: customer.unsubscribed,
    unsubscribedAt: customer.unsubscribedAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function recordUnsubscribe(emailRaw: string, reason?: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    throw new HttpError(400, "Invalid email address", "INVALID_EMAIL");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.unsubscribe.upsert({
      where: { email },
      create: { email, reason },
      update: { reason: reason ?? undefined },
    }),
    prisma.customer.updateMany({
      where: { email },
      data: { unsubscribed: true, unsubscribedAt: now, marketingConsent: false },
    }),
  ]);
}
