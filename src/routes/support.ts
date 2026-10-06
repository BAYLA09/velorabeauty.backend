import { Router } from "express";
import { z } from "zod";
import { requireStoreAuth } from "../middleware/auth.js";
import { handleInboundSupportEmail } from "../services/support.service.js";

export const supportRouter = Router();

const inboundSchema = z.object({
  senderEmail: z.string().min(3),
  recipientEmail: z.string().min(3),
  subject: z.string().min(1),
  body: z.string().min(1),
  providerMessageId: z.string().optional(),
});

supportRouter.post("/inbound", requireStoreAuth, async (req, res, next) => {
  try {
    const body = inboundSchema.parse(req.body);
    const result = await handleInboundSupportEmail(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
