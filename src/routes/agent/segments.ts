import { Router } from "express";
import { z } from "zod";
import {
  SEGMENT_CATALOG,
  getSegmentsForCustomer,
  listCustomersBySegment,
  type SegmentSlug,
} from "../../services/segment.service.js";
import { toSafeCustomer } from "../../services/customer.service.js";

export const agentSegmentsRouter = Router();

agentSegmentsRouter.get("/", (_req, res) => {
  res.json({ segments: SEGMENT_CATALOG });
});

agentSegmentsRouter.get("/:slug/customers", async (req, res, next) => {
  try {
    const slug = req.params.slug as SegmentSlug;
    const customers = await listCustomersBySegment(slug);
    res.json({
      segment: slug,
      customers: customers.map(toSafeCustomer),
      count: customers.length,
    });
  } catch (err) {
    next(err);
  }
});

agentSegmentsRouter.get("/customer/:customerId", async (req, res, next) => {
  try {
    const segments = await getSegmentsForCustomer(req.params.customerId);
    res.json({ customerId: req.params.customerId, segments });
  } catch (err) {
    next(err);
  }
});
