import { EmailCampaignStatus } from "@prisma/client";
import { Router } from "express";
import { requireStoreAuth } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { setMarketingPaused, isMarketingPausedGlobally } from "../../services/system-settings.service.js";
import { getEmailMetrics } from "../../services/metrics.service.js";
import { toSafeCustomer } from "../../services/customer.service.js";
import { listEmailHistory } from "../../services/email.service.js";
import { updateCampaignStatus, getCampaign } from "../../services/campaign.service.js";
import { getCustomerById } from "../../services/customer.service.js";

export const adminRouter = Router();

adminRouter.use(requireStoreAuth);

adminRouter.get("/marketing/status", async (_req, res) => {
  res.json({ paused: await isMarketingPausedGlobally() });
});

adminRouter.post("/marketing/pause", async (_req, res) => {
  await setMarketingPaused(true);
  res.json({ paused: true });
});

adminRouter.post("/marketing/resume", async (_req, res) => {
  await setMarketingPaused(false);
  res.json({ paused: false });
});

adminRouter.post("/campaigns/:id/pause", async (req, res, next) => {
  try {
    const campaign = await updateCampaignStatus(req.params.id, EmailCampaignStatus.PAUSED);
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/campaigns/:id/resume", async (req, res, next) => {
  try {
    const campaign = await updateCampaignStatus(req.params.id, EmailCampaignStatus.ACTIVE);
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/customers/:id", async (req, res, next) => {
  try {
    const customer = await getCustomerById(req.params.id);
    res.json({ customer: toSafeCustomer(customer) });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/customers/:id/emails", async (req, res, next) => {
  try {
    const emails = await listEmailHistory(req.params.id, 200);
    res.json({ emails });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/support/tickets", async (_req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/metrics/email", async (req, res, next) => {
  try {
    const days = Number(req.query.days ?? 30);
    res.json(await getEmailMetrics(days));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/emails/failed", async (_req, res, next) => {
  try {
    const emails = await prisma.emailMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ emails });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/emails/bounced", async (_req, res, next) => {
  try {
    const emails = await prisma.emailMessage.findMany({
      where: { status: "BOUNCED" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ emails });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/unsubscribes", async (_req, res, next) => {
  try {
    const rows = await prisma.unsubscribe.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ unsubscribes: rows });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/campaigns/:id", async (req, res, next) => {
  try {
    res.json({ campaign: await getCampaign(req.params.id) });
  } catch (err) {
    next(err);
  }
});
