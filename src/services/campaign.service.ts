import type { EmailCampaignType, Prisma } from "@prisma/client";
import { EmailCampaignStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

export async function createCampaign(data: {
  name: string;
  type: EmailCampaignType;
  targetSegment?: string;
  description?: string;
  experimentId?: string;
}) {
  return prisma.emailCampaign.create({
    data: {
      name: data.name,
      type: data.type,
      status: EmailCampaignStatus.DRAFT,
      targetSegment: data.targetSegment,
      description: data.description,
      experimentId: data.experimentId,
    },
  });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new HttpError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
  return campaign;
}

export async function updateCampaignStatus(id: string, status: EmailCampaignStatus) {
  await getCampaign(id);
  return prisma.emailCampaign.update({ where: { id }, data: { status } });
}

export async function listCampaigns(filter?: Prisma.EmailCampaignWhereInput) {
  return prisma.emailCampaign.findMany({
    where: filter,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
