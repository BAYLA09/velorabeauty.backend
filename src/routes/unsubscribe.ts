import { Router } from "express";
import { z } from "zod";
import { recordUnsubscribe } from "../services/customer.service.js";

export const unsubscribeRouter = Router();

const unsubscribeSchema = z.object({
  email: z.string().min(3),
  reason: z.string().optional(),
});

/** Public unsubscribe endpoint (linked from marketing emails). */
unsubscribeRouter.post("/", async (req, res, next) => {
  try {
    const body = unsubscribeSchema.parse(req.body);
    await recordUnsubscribe(body.email, body.reason);
    res.json({ success: true, message: "You have been unsubscribed." });
  } catch (err) {
    next(err);
  }
});
