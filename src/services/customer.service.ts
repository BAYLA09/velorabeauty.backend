import { CustomerStatus, type Customer } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isValidEmail, normalizeEmail } from "../lib/email-normalize.js";
import { recordCustomerEvent } from "./customer-event.service.js";

export type UpsertCustomerInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  language?: string;
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
    const created = await prisma.customer.create({
      data: {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        country: input.country,
        language: input.language,
        marketingConsent,
        marketingConsentAt: marketingConsent ? now : null,
        customerStatus: CustomerStatus.NEW,
      },
    });
    await recordCustomerEvent({
      customerId: created.id,
      type: "CUSTOMER_CREATED",
      metadata: { email },
    });
    if (marketingConsent) {
      await recordCustomerEvent({
        customerId: created.id,
        type: "EMAIL_CAPTURED",
        metadata: { marketingConsent: true },
      });
    }
    return created;
  }

  return prisma.customer.update({
    where: { id: existing.id },
    data: {
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      phone: input.phone ?? existing.phone,
      country: input.country ?? existing.country,
      language: input.language ?? existing.language,
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
    language: customer.language,
    customerStatus: customer.customerStatus,
    firstPurchaseAt: customer.firstPurchaseAt,
    lastPurchaseAt: customer.lastPurchaseAt,
    totalOrders: customer.totalOrders,
    totalSpent: customer.totalSpent,
    averageOrderValue: customer.averageOrderValue,
    marketingConsent: customer.marketingConsent,
    marketingConsentAt: customer.marketingConsentAt,
    unsubscribed: customer.unsubscribed,
    unsubscribedAt: customer.unsubscribedAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function searchCustomers(query: string, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return prisma.customer.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
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
      data: {
        unsubscribed: true,
        unsubscribedAt: now,
        marketingConsent: false,
        customerStatus: CustomerStatus.UNSUBSCRIBED,
      },
    }),
  ]);

  const customer = await prisma.customer.findUnique({ where: { email } });
  if (customer) {
    await recordCustomerEvent({
      customerId: customer.id,
      type: "UNSUBSCRIBED",
      metadata: { reason: reason ?? null },
    });
  }
}
