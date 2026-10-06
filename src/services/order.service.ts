import { CheckoutStatus, CustomerEventType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { upsertCustomer } from "./customer.service.js";
import { refreshCustomerStats } from "./customer-stats.service.js";
import { recordCustomerEvent } from "./customer-event.service.js";

export type CreateOrderInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  externalOrderId: string;
  externalCheckoutId?: string;
  totalAmount: number;
  currency: string;
  status: string;
};

export async function createOrder(input: CreateOrderInput) {
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

  const eventType =
    input.status.toLowerCase() === "paid"
      ? CustomerEventType.ORDER_PAID
      : CustomerEventType.ORDER_CREATED;
  await recordCustomerEvent({
    customerId: customer.id,
    type: eventType,
    metadata: { externalOrderId: order.externalOrderId, totalAmount: input.totalAmount },
  });
  await refreshCustomerStats(customer.id);

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
