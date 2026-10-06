import { CheckoutStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { toSafeCustomer } from "./customer.service.js";
import { listEmailHistory } from "./email.service.js";
import { listSupportTickets } from "./support.service.js";

export async function getAgentCustomerContext(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }

  const [orders, checkouts, emails, tickets] = await Promise.all([
    prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.checkout.findMany({
      where: {
        customerId,
        status: { in: [CheckoutStatus.ACTIVE, CheckoutStatus.ABANDONED] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    listEmailHistory(customerId, 50),
    listSupportTickets(customerId),
  ]);

  return {
    customer: toSafeCustomer(customer),
    marketingConsent: customer.marketingConsent,
    unsubscribeStatus: {
      unsubscribed: customer.unsubscribed,
      unsubscribedAt: customer.unsubscribedAt,
    },
    recentOrders: orders,
    activeAndAbandonedCheckouts: checkouts,
    emailHistory: emails,
    supportTickets: tickets,
  };
}
