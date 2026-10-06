import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireStoreAuth } from "../middleware/auth.js";
import {
  createCheckout,
  markCheckoutAbandoned,
  markCheckoutRecovered,
} from "../services/checkout.service.js";

export const checkoutsRouter = Router();

const checkoutBodySchema = z.object({
  email: z.string().min(3),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  externalCheckoutId: z.string().min(1),
  cartData: z.record(z.unknown()),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
});

checkoutsRouter.post("/", requireStoreAuth, async (req, res, next) => {
  try {
    const body = checkoutBodySchema.parse(req.body);
    const { cartData, ...rest } = body;
    const checkout = await createCheckout({
      ...rest,
      cartData: cartData as Prisma.InputJsonValue,
    });
    res.status(201).json({ checkout });
  } catch (err) {
    next(err);
  }
});

checkoutsRouter.post("/:id/abandon", requireStoreAuth, async (req, res, next) => {
  try {
    const checkout = await markCheckoutAbandoned(req.params.id);
    res.json({ checkout });
  } catch (err) {
    next(err);
  }
});

checkoutsRouter.post("/:id/recover", requireStoreAuth, async (req, res, next) => {
  try {
    const checkout = await markCheckoutRecovered(req.params.id);
    res.json({ checkout });
  } catch (err) {
    next(err);
  }
});
