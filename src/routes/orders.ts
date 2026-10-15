import { Router } from "express";
import { z } from "zod";
import { requireStoreAuth } from "../middleware/auth.js";
import { createOrder } from "../services/order.service.js";

export const ordersRouter = Router();

ordersRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    endpoint: "POST /api/orders",
    auth: "Authorization: Bearer STORE_API_KEY",
    description: "Create a COD/card order. New COD orders sync to Google Sheets when configured.",
    codSheetEnv: [
      "GOOGLE_SHEETS_SPREADSHEET_ID",
      "GOOGLE_SHEETS_GID",
      "GOOGLE_SERVICE_ACCOUNT_JSON",
    ],
    docs: "https://github.com/BAYLA09/velorabeauty.backend/blob/main/docs/GOOGLE_SHEETS_COD.md",
  });
});

const orderBodySchema = z.object({
  email: z.string().min(3),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  externalOrderId: z.string().min(1),
  externalCheckoutId: z.string().optional(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  status: z.string().min(1),
  paymentMethod: z.string().optional(),
  orderDate: z.string().optional(),
  url: z.string().optional(),
  sku: z.string().optional(),
  product: z.string().optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  price: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
});

ordersRouter.post("/", requireStoreAuth, async (req, res, next) => {
  try {
    const body = orderBodySchema.parse(req.body);
    const result = await createOrder(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
