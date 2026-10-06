import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { normalizeEmail } from "../../lib/email-normalize.js";
import { findCustomerByEmail, getCustomerById, toSafeCustomer } from "../../services/customer.service.js";
import { listEmailHistory } from "../../services/email.service.js";
import { getAgentCustomerContext } from "../../services/agent-context.service.js";
import { listOrdersForCustomer } from "../../services/order.service.js";

export const agentCustomersRouter = Router();

agentCustomersRouter.get("/:emailOrId/orders", async (req, res, next) => {
  try {
    const customer = await resolveCustomerParam(req.params.emailOrId);
    const orders = await listOrdersForCustomer(customer.id);
    res.json({ customerId: customer.id, orders });
  } catch (err) {
    next(err);
  }
});

agentCustomersRouter.get("/:emailOrId/checkouts", async (req, res, next) => {
  try {
    const customer = await resolveCustomerParam(req.params.emailOrId);
    const checkouts = await prisma.checkout.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ customerId: customer.id, checkouts });
  } catch (err) {
    next(err);
  }
});

agentCustomersRouter.get("/:emailOrId/emails", async (req, res, next) => {
  try {
    const customer = await resolveCustomerParam(req.params.emailOrId);
    const emails = await listEmailHistory(customer.id);
    res.json({ customerId: customer.id, emails });
  } catch (err) {
    next(err);
  }
});

agentCustomersRouter.get("/:emailOrId/context", async (req, res, next) => {
  try {
    const customer = await resolveCustomerParam(req.params.emailOrId);
    const context = await getAgentCustomerContext(customer.id);
    res.json(context);
  } catch (err) {
    next(err);
  }
});

/** GET /api/agent/customers/:email — lookup by email (contains @) or by id */
agentCustomersRouter.get("/:emailOrId", async (req, res, next) => {
  try {
    const customer = await resolveCustomerParam(req.params.emailOrId);
    res.json({ customer: toSafeCustomer(customer) });
  } catch (err) {
    next(err);
  }
});

async function resolveCustomerParam(emailOrId: string) {
  if (emailOrId.includes("@")) {
    const customer = await findCustomerByEmail(normalizeEmail(emailOrId));
    if (!customer) {
      throw new HttpError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    }
    return customer;
  }
  return getCustomerById(emailOrId);
}
