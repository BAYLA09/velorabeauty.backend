import { CustomerEventType, type Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { recordCustomerEvent } from "../../services/customer-event.service.js";
import { getCustomerById } from "../../services/customer.service.js";

export const agentEventsRouter = Router();

const schema = z.object({
  customerId: z.string().min(1),
  type: z.nativeEnum(CustomerEventType),
  metadata: z.record(z.unknown()).optional(),
});

agentEventsRouter.post("/", async (req, res, next) => {
  try {
    const body = schema.parse(req.body);
    await getCustomerById(body.customerId);
    await recordCustomerEvent({
      ...body,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    });
    res.status(201).json({ recorded: true });
  } catch (err) {
    next(err);
  }
});
