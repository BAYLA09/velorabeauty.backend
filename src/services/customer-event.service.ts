import type { CustomerEventType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function recordCustomerEvent(params: {
  customerId: string;
  type: CustomerEventType;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.customerEvent.create({
    data: {
      customerId: params.customerId,
      type: params.type,
      metadata: params.metadata ?? {},
    },
  });
}

export async function listCustomerTimeline(customerId: string, limit = 100) {
  return prisma.customerEvent.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
