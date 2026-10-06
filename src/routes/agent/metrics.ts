import { Router } from "express";
import { z } from "zod";
import { getCampaignMetrics, getEmailMetrics } from "../../services/metrics.service.js";

export const agentMetricsRouter = Router();

agentMetricsRouter.get("/email", async (req, res, next) => {
  try {
    const days = z.coerce.number().int().positive().default(30).parse(req.query.days ?? 30);
    const metrics = await getEmailMetrics(days);
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

agentMetricsRouter.get("/campaigns/:id", async (req, res, next) => {
  try {
    const metrics = await getCampaignMetrics(req.params.id);
    if (!metrics) {
      res.status(404).json({ error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" });
      return;
    }
    res.json(metrics);
  } catch (err) {
    next(err);
  }
});
