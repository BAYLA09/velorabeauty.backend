import { EmailType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { validateAndSendAgentEmail } from "../../services/email.service.js";

export const agentEmailRouter = Router();

const sendSchema = z.object({
  customerId: z.string().min(1),
  recipientEmail: z.string().min(3),
  subject: z.string().min(1),
  body: z.string().min(1),
  type: z.nativeEnum(EmailType),
  checkoutId: z.string().optional(),
  model: z.string().optional(),
});

agentEmailRouter.post("/send", async (req, res, next) => {
  try {
    const body = sendSchema.parse(req.body);
    const result = await validateAndSendAgentEmail(body);

    if (!result.success) {
      res.status(422).json({
        sent: false,
        reason: result.reason,
        code: result.code,
      });
      return;
    }

    res.status(201).json({
      sent: true,
      emailMessage: result.emailMessage,
      providerMessageId: result.providerMessageId,
    });
  } catch (err) {
    next(err);
  }
});
