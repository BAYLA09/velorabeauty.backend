import { SupportCategory } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  agentSupportReply,
  createSupportTicket,
  getSupportTicket,
  markTicketHumanRequired,
} from "../../services/support.service.js";

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

const createTicketSchema = z.object({
  customerId: z.string().min(1),
  subject: z.string().min(1),
  message: z.string().min(1),
  category: z.nativeEnum(SupportCategory).optional(),
});

agentSupportRouter.post("/tickets", async (req, res, next) => {
  try {
    const body = createTicketSchema.parse(req.body);
    const ticket = await createSupportTicket(body);
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

agentSupportRouter.get("/tickets/:id", async (req, res, next) => {
  try {
    const ticket = await getSupportTicket(req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

agentSupportRouter.post("/tickets/:id/human-required", async (req, res, next) => {
  try {
    const reason = z.string().optional().parse(req.body?.reason);
    const ticket = await markTicketHumanRequired(req.params.id, reason);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
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
