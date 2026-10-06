import { EmailDirection, EmailType } from "@prisma/client";
import { prisma } from "./prisma.js";

const MARKETING_TYPES = new Set<EmailType>([
  EmailType.ABANDONED_CHECKOUT,
  EmailType.FOLLOW_UP,
  EmailType.OTHER,
]);

export function isMarketingEmailType(type: EmailType): boolean {
  return MARKETING_TYPES.has(type);
}

export async function countMarketingEmailsInWindow(
  customerId: string,
  days: number,
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  return prisma.emailMessage.count({
    where: {
      customerId,
      direction: EmailDirection.OUTBOUND,
      type: { in: [...MARKETING_TYPES] },
      createdAt: { gte: since },
      status: { in: ["QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED"] },
    },
  });
}
