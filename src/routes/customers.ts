import { Router } from "express";
import { z } from "zod";
import { requireStoreAuth } from "../middleware/auth.js";
import { upsertCustomer, toSafeCustomer } from "../services/customer.service.js";

export const customersRouter = Router();

const customerBodySchema = z.object({
  email: z.string().min(3),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  marketingConsent: z.boolean().optional(),
});

customersRouter.post("/", requireStoreAuth, async (req, res, next) => {
  try {
    const body = customerBodySchema.parse(req.body);
    const customer = await upsertCustomer(body);
    res.status(201).json({ customer: toSafeCustomer(customer) });
  } catch (err) {
    next(err);
  }
});
