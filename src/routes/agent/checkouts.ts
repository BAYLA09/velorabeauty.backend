import { Router } from "express";
import { listAbandonedCheckoutsForAgent } from "../../services/checkout.service.js";

export const agentCheckoutsRouter = Router();

agentCheckoutsRouter.get("/abandoned", async (_req, res, next) => {
  try {
    const items = await listAbandonedCheckoutsForAgent();
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});
