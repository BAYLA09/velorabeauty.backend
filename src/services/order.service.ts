import { CheckoutStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { upsertCustomer } from "./customer.service.js";
import { appendCodOrderToSheet, isCodSheetsConfigured } from "./google-sheets-cod.service.js";
import { logStructured } from "../lib/logger.js";

export type CreateOrderInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  country?: string;
  address?: string;
  externalOrderId: string;
  externalCheckoutId?: string;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  orderDate?: string;
  url?: string;
  sku?: string;
  product?: string;
  quantity?: number | string;
  price?: number | string;
  notes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

function isCodOrder(input: CreateOrderInput): boolean {
  const method = (input.paymentMethod ?? "cod").toLowerCase();
  return method === "cod" || method === "cash_on_delivery";
}

function displayName(input: CreateOrderInput): string {
  if (input.name?.trim()) return input.name.trim();
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

export async function createOrder(input: CreateOrderInput) {
  const existing = await prisma.order.findUnique({
    where: { externalOrderId: input.externalOrderId },
  });

  const customer = await upsertCustomer({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    country: input.country,
  });

  const order = await prisma.order.upsert({
    where: { externalOrderId: input.externalOrderId },
    create: {
      customerId: customer.id,
      externalOrderId: input.externalOrderId,
      totalAmount: input.totalAmount,
      currency: input.currency.toUpperCase(),
      status: input.status,
    },
    update: {
      totalAmount: input.totalAmount,
      currency: input.currency.toUpperCase(),
      status: input.status,
    },
  });

  if (input.externalCheckoutId) {
    const checkout = await prisma.checkout.findUnique({
      where: { externalCheckoutId: input.externalCheckoutId },
    });
    if (checkout) {
      await prisma.checkout.update({
        where: { id: checkout.id },
        data: {
          status: CheckoutStatus.RECOVERED,
          recoveredAt: new Date(),
        },
      });
    }
  } else {
    await prisma.checkout.updateMany({
      where: {
        customerId: customer.id,
        status: { in: [CheckoutStatus.ACTIVE, CheckoutStatus.ABANDONED] },
      },
      data: {
        status: CheckoutStatus.RECOVERED,
        recoveredAt: new Date(),
      },
    });
  }

  const isNewOrder = !existing;
  if (isNewOrder && isCodOrder(input) && isCodSheetsConfigured()) {
    void appendCodOrderToSheet({
      orderDate: input.orderDate ?? new Date().toISOString(),
      country: input.country ?? "",
      name: displayName(input),
      phone: input.phone ?? "",
      address: input.address ?? "",
      url: input.url ?? "",
      sku: input.sku ?? "",
      product: input.product ?? "",
      quantity: String(input.quantity ?? 1),
      price: String(input.price ?? input.totalAmount),
      currency: input.currency.toUpperCase(),
      notes: input.notes ?? input.externalOrderId,
      utmSource: input.utmSource ?? "",
      utmMedium: input.utmMedium ?? "",
      utmCampaign: input.utmCampaign ?? "",
      utmTerm: input.utmTerm ?? "",
      utmContent: input.utmContent ?? "",
    }).catch((err) => {
      logStructured("error", "google_sheets_cod_failed", {
        externalOrderId: input.externalOrderId,
        message: err instanceof Error ? err.message : "unknown",
      });
    });
  }

  return order;
}

export async function listOrdersForCustomer(customerId: string) {
  await assertCustomerExists(customerId);
  return prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function assertCustomerExists(customerId: string): Promise<void> {
  const count = await prisma.customer.count({ where: { id: customerId } });
  if (count === 0) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
}
