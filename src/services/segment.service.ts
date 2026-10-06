import {
  CheckoutStatus,
  CustomerStatus,
  EmailDirection,
  EmailStatus,
  SupportTicketStatus,
  type Customer,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { loadEnv } from "../config/env.js";

export type SegmentSlug =
  | "new_customer"
  | "first_time_buyer"
  | "repeat_buyer"
  | "vip"
  | "high_spender"
  | "abandoned_checkout"
  | "inactive_customer"
  | "recently_purchased"
  | "support_issue"
  | "email_openers"
  | "email_clickers"
  | "email_non_engaged"
  | "unsubscribed"
  | "win_back";

export const SEGMENT_CATALOG: { slug: SegmentSlug; description: string }[] = [
  { slug: "new_customer", description: "No orders yet, recently created" },
  { slug: "first_time_buyer", description: "Exactly one completed order" },
  { slug: "repeat_buyer", description: "Two or more orders" },
  { slug: "vip", description: "VIP customer status or high lifetime value" },
  { slug: "high_spender", description: "Total spent above VIP threshold" },
  { slug: "abandoned_checkout", description: "Has an abandoned checkout" },
  { slug: "inactive_customer", description: "No purchase within inactive window" },
  { slug: "recently_purchased", description: "Purchased within last 14 days" },
  { slug: "support_issue", description: "Open or human-required support ticket" },
  { slug: "email_openers", description: "Opened a marketing email in last 30 days" },
  { slug: "email_clickers", description: "Clicked a marketing email in last 30 days" },
  { slug: "email_non_engaged", description: "Received but did not open recent marketing emails" },
  { slug: "unsubscribed", description: "Unsubscribed from marketing" },
  { slug: "win_back", description: "Inactive for WINBACK_DAYS+ with past purchases" },
];

export async function getSegmentsForCustomer(customerId: string): Promise<SegmentSlug[]> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return [];
  return computeSegmentsForCustomer(customer);
}

export async function listCustomersBySegment(slug: SegmentSlug, limit = 50) {
  const env = loadEnv();
  const where = buildSegmentWhere(slug, env);
  const customers = await prisma.customer.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  return customers;
}

export async function computeSegmentsForCustomer(
  customer: Customer,
): Promise<SegmentSlug[]> {
  const env = loadEnv();
  const segments: SegmentSlug[] = [];
  const now = Date.now();

  if (customer.unsubscribed) segments.push("unsubscribed");
  if (customer.totalOrders === 0 && customer.customerStatus === CustomerStatus.NEW) {
    segments.push("new_customer");
  }
  if (customer.totalOrders === 1) segments.push("first_time_buyer");
  if (customer.totalOrders >= 2) segments.push("repeat_buyer");
  if (customer.customerStatus === CustomerStatus.VIP) segments.push("vip");
  if (Number(customer.totalSpent) >= env.VIP_MIN_TOTAL_SPENT) segments.push("high_spender");

  const abandoned = await prisma.checkout.count({
    where: { customerId: customer.id, status: CheckoutStatus.ABANDONED },
  });
  if (abandoned > 0) segments.push("abandoned_checkout");

  if (customer.customerStatus === CustomerStatus.INACTIVE) segments.push("inactive_customer");

  if (customer.lastPurchaseAt) {
    const daysSince = (now - customer.lastPurchaseAt.getTime()) / (24 * 60 * 60_000);
    if (daysSince <= 14) segments.push("recently_purchased");
    if (daysSince >= env.WINBACK_DAYS && customer.totalOrders > 0) segments.push("win_back");
  }

  const openTicket = await prisma.supportTicket.count({
    where: {
      customerId: customer.id,
      status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.HUMAN_REQUIRED] },
    },
  });
  if (openTicket > 0) segments.push("support_issue");

  const since = new Date(now - 30 * 24 * 60 * 60_000);
  const emails = await prisma.emailMessage.findMany({
    where: {
      customerId: customer.id,
      direction: EmailDirection.OUTBOUND,
      createdAt: { gte: since },
      status: { not: EmailStatus.FAILED },
    },
    select: { openedAt: true, clickedAt: true, status: true },
  });

  if (emails.some((e) => e.openedAt || e.status === EmailStatus.OPENED)) {
    segments.push("email_openers");
  }
  if (emails.some((e) => e.clickedAt || e.status === EmailStatus.CLICKED)) {
    segments.push("email_clickers");
  }
  if (emails.length > 0 && !emails.some((e) => e.openedAt || e.clickedAt)) {
    segments.push("email_non_engaged");
  }

  return [...new Set(segments)];
}

function buildSegmentWhere(slug: SegmentSlug, env: ReturnType<typeof loadEnv>): Prisma.CustomerWhereInput {
  const winbackDate = new Date(Date.now() - env.WINBACK_DAYS * 24 * 60 * 60_000);
  const inactiveDate = new Date(Date.now() - env.INACTIVE_DAYS * 24 * 60 * 60_000);
  const recentPurchase = new Date(Date.now() - 14 * 24 * 60 * 60_000);

  switch (slug) {
    case "unsubscribed":
      return { unsubscribed: true };
    case "new_customer":
      return { totalOrders: 0, customerStatus: CustomerStatus.NEW };
    case "first_time_buyer":
      return { totalOrders: 1 };
    case "repeat_buyer":
      return { totalOrders: { gte: 2 } };
    case "vip":
      return { customerStatus: CustomerStatus.VIP };
    case "high_spender":
      return { totalSpent: { gte: env.VIP_MIN_TOTAL_SPENT } };
    case "inactive_customer":
      return { customerStatus: CustomerStatus.INACTIVE };
    case "recently_purchased":
      return { lastPurchaseAt: { gte: recentPurchase } };
    case "win_back":
      return {
        totalOrders: { gt: 0 },
        lastPurchaseAt: { lte: winbackDate },
        unsubscribed: false,
      };
    case "abandoned_checkout":
      return { checkouts: { some: { status: CheckoutStatus.ABANDONED } } };
    case "support_issue":
      return {
        supportTickets: {
          some: { status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.HUMAN_REQUIRED] } },
        },
      };
    default:
      return {};
  }
}
