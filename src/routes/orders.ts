import { Router } from "express";
import { z } from "zod";
import { requireStoreAuth } from "../middleware/auth.js";
import { createOrder } from "../services/order.service.js";

export const ordersRouter = Router();

const orderBodySchema = z.object({
  email: z.string().min(3),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  externalOrderId: z.string().min(1),
  externalCheckoutId: z.string().optional(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  status: z.string().min(1),
});

ordersRouter.post("/", requireStoreAuth, async (req, res, next) => {
  try {
    const body = orderBodySchema.parse(req.body);
    const order = await createOrder(body);
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});
