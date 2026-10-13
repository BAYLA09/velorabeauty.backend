import { CustomerEventType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isPaidOrderStatus } from "../lib/order-status.js";
import { upsertCustomer } from "./customer.service.js";
import { refreshCustomerStats } from "./customer-stats.service.js";
import { recordCustomerEvent } from "./customer-event.service.js";
import { recoverCheckoutsForPaidOrder } from "./checkout.service.js";

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

  const existing = await prisma.order.findUnique({
    where: { externalOrderId: input.externalOrderId },
  });
  const wasPaid = existing ? isPaidOrderStatus(existing.status) : false;
  const nowPaid = isPaidOrderStatus(input.status);
  const externalCheckoutId = input.externalCheckoutId ?? existing?.externalCheckoutId ?? undefined;

  let order;
  try {
    order = await prisma.order.upsert({
      where: { externalOrderId: input.externalOrderId },
      create: {
        customerId: customer.id,
        externalOrderId: input.externalOrderId,
        externalCheckoutId: input.externalCheckoutId,
        totalAmount: input.totalAmount,
        currency: input.currency.toUpperCase(),
        status: input.status,
      },
      update: {
        totalAmount: input.totalAmount,
        currency: input.currency.toUpperCase(),
        status: input.status,
        ...(input.externalCheckoutId ? { externalCheckoutId: input.externalCheckoutId } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(
        409,
        "externalCheckoutId is already linked to another order",
        "CHECKOUT_ALREADY_LINKED",
      );
    }
    throw err;
  }

  if (nowPaid) {
    await recoverCheckoutsForPaidOrder({
      customerId: customer.id,
      externalCheckoutId,
    });
  }

  if (!existing || (nowPaid && !wasPaid)) {
    await recordCustomerEvent({
      customerId: customer.id,
      type: nowPaid ? CustomerEventType.ORDER_PAID : CustomerEventType.ORDER_CREATED,
      metadata: { externalOrderId: order.externalOrderId, totalAmount: input.totalAmount },
    });
  }
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
