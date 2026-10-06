import { CustomerStatus, type Customer, type Order } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { loadEnv } from "../config/env.js";

export async function refreshCustomerStats(customerId: string): Promise<Customer> {
  const orders = await prisma.order.findMany({
    where: { customerId, status: { notIn: ["cancelled", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
  });

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const stats = computeStatsFromOrders(orders);
  const customerStatus = deriveCustomerStatus(customer, stats, orders);

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalSpent,
      averageOrderValue: stats.averageOrderValue,
      firstPurchaseAt: stats.firstPurchaseAt,
      lastPurchaseAt: stats.lastPurchaseAt,
      customerStatus,
    },
  });
}

export function computeStatsFromOrders(orders: Order[]) {
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  return {
    totalOrders,
    totalSpent,
    averageOrderValue,
    firstPurchaseAt: orders[0]?.createdAt ?? null,
    lastPurchaseAt: orders[orders.length - 1]?.createdAt ?? null,
  };
}

export function deriveCustomerStatus(
  customer: Pick<Customer, "unsubscribed" | "marketingConsent" | "createdAt">,
  stats: { totalOrders: number; totalSpent: number; lastPurchaseAt: Date | null },
  _orders: Order[],
): CustomerStatus {
  if (customer.unsubscribed) return CustomerStatus.UNSUBSCRIBED;

  const env = loadEnv();
  const now = Date.now();
  const inactiveMs = env.INACTIVE_DAYS * 24 * 60 * 60_000;

  if (stats.totalOrders === 0) {
    const ageMs = now - customer.createdAt.getTime();
    return ageMs > inactiveMs ? CustomerStatus.INACTIVE : CustomerStatus.NEW;
  }

  if (
    stats.totalSpent >= env.VIP_MIN_TOTAL_SPENT ||
    stats.totalOrders >= env.VIP_MIN_ORDERS
  ) {
    return CustomerStatus.VIP;
  }

  if (stats.lastPurchaseAt && now - stats.lastPurchaseAt.getTime() > inactiveMs) {
    return CustomerStatus.INACTIVE;
  }

  const winbackMs = env.WINBACK_DAYS * 24 * 60 * 60_000;
  if (stats.lastPurchaseAt && now - stats.lastPurchaseAt.getTime() > winbackMs) {
    return CustomerStatus.AT_RISK;
  }

  return CustomerStatus.ACTIVE;
}
