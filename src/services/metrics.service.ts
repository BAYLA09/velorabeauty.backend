import { EmailDirection, EmailStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function getEmailMetrics(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60_000);

  const messages = await prisma.emailMessage.groupBy({
    by: ["status"],
    where: { direction: EmailDirection.OUTBOUND, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const byType = await prisma.emailMessage.groupBy({
    by: ["type"],
    where: { direction: EmailDirection.OUTBOUND, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const unsubscribes = await prisma.unsubscribe.count({ where: { createdAt: { gte: since } } });

  const recoveredCheckouts = await prisma.checkout.count({
    where: { status: "RECOVERED", recoveredAt: { gte: since } },
  });

  const statusMap = Object.fromEntries(messages.map((m) => [m.status, m._count._all]));

  return {
    periodDays: sinceDays,
    since: since.toISOString(),
    counts: {
      sent: statusMap[EmailStatus.SENT] ?? 0,
      delivered: statusMap[EmailStatus.DELIVERED] ?? 0,
      opened: statusMap[EmailStatus.OPENED] ?? 0,
      clicked: statusMap[EmailStatus.CLICKED] ?? 0,
      bounced: statusMap[EmailStatus.BOUNCED] ?? 0,
      failed: statusMap[EmailStatus.FAILED] ?? 0,
      queued: statusMap[EmailStatus.QUEUED] ?? 0,
    },
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    unsubscribes,
    recoveredCheckouts,
    revenueAttributed: null,
    note: "revenueAttributed is null unless order/checkout attribution is explicitly implemented",
  };
}

export async function getCampaignMetrics(campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;

  const messages = await prisma.emailMessage.findMany({
    where: { campaignId, direction: EmailDirection.OUTBOUND },
  });

  const experimentVariants = messages.reduce<Record<string, number>>((acc, m) => {
    const key = m.variant ?? "default";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    campaign,
    totalMessages: messages.length,
    byStatus: messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {}),
    experimentVariants,
    revenueAttributed: null,
  };
}
