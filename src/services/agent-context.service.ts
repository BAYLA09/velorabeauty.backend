import { CheckoutStatus, EmailDirection } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { toSafeCustomer } from "./customer.service.js";
import { listEmailHistory } from "./email.service.js";
import { listSupportTickets } from "./support.service.js";
import { listCustomerTimeline } from "./customer-event.service.js";
import { getSegmentsForCustomer } from "./segment.service.js";
import { countMarketingEmailsInWindow } from "../lib/email-rules.js";
import { loadEnv } from "../config/env.js";

export async function getAgentCustomerContext(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }

  const env = loadEnv();
  const [orders, checkouts, emails, tickets, timeline, segments] = await Promise.all([
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
    listCustomerTimeline(customerId, 50),
    getSegmentsForCustomer(customerId),
  ]);

  const marketingSent7d = await countMarketingEmailsInWindow(customerId, 7);
  const outboundCount = emails.filter((e) => e.direction === EmailDirection.OUTBOUND).length;
  const openedCount = emails.filter((e) => e.openedAt || e.status === "OPENED").length;
  const clickedCount = emails.filter((e) => e.clickedAt || e.status === "CLICKED").length;

  return {
    customer: toSafeCustomer(customer),
    marketingConsent: customer.marketingConsent,
    unsubscribeStatus: {
      unsubscribed: customer.unsubscribed,
      unsubscribedAt: customer.unsubscribedAt,
    },
    customerSegment: segments,
    lifecycle: {
      customerStatus: customer.customerStatus,
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      averageOrderValue: customer.averageOrderValue,
      firstPurchaseAt: customer.firstPurchaseAt,
      lastPurchaseAt: customer.lastPurchaseAt,
    },
    engagementMetrics: {
      outboundEmailsInHistory: outboundCount,
      openedCount,
      clickedCount,
      marketingEmailsLast7Days: marketingSent7d,
      marketingLimitPer7Days: env.MAX_MARKETING_EMAILS_PER_7_DAYS,
    },
    timeline,
    recentOrders: orders,
    activeAndAbandonedCheckouts: checkouts,
    emailHistory: emails,
    supportTickets: tickets,
  };
}
