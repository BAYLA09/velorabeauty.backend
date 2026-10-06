import { Router } from "express";
import { z } from "zod";
import { agentSupportReply } from "../../services/support.service.js";

export const agentSupportRouter = Router();

const replySchema = z.object({
  customerId: z.string().min(1),
  ticketId: z.string().min(1),
  recipientEmail: z.string().min(3),
  subject: z.string().min(1),
  body: z.string().min(1),
  aiConfidence: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
});

agentSupportRouter.post("/reply", async (req, res, next) => {
  try {
    const body = replySchema.parse(req.body);
    const result = await agentSupportReply(body);

    if (!result.sent) {
      res.status(result.humanRequired ? 409 : 422).json(result);
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
