import { EmailCampaignStatus, EmailCampaignType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaignStatus,
} from "../../services/campaign.service.js";

export const agentCampaignsRouter = Router();

agentCampaignsRouter.get("/", async (_req, res, next) => {
  try {
    const campaigns = await listCampaigns();
    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
});

agentCampaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(EmailCampaignType),
  targetSegment: z.string().optional(),
  description: z.string().optional(),
  experimentId: z.string().optional(),
});

agentCampaignsRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const campaign = await createCampaign(body);
    res.status(201).json({ campaign });
  } catch (err) {
    next(err);
  }
});

agentCampaignsRouter.post("/:id/activate", async (req, res, next) => {
  try {
    const campaign = await updateCampaignStatus(req.params.id, EmailCampaignStatus.ACTIVE);
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});
