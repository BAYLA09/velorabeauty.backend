import { Router } from "express";
import { requireAgentAuth } from "../../middleware/auth.js";
import { getAgentEmailRateLimiter } from "../../middleware/rateLimit.js";
import { agentCustomersRouter } from "./customers.js";
import { agentCheckoutsRouter } from "./checkouts.js";
import { agentEmailRouter } from "./email.js";
import { agentSupportRouter } from "./support.js";

export const agentRouter = Router();

agentRouter.use(requireAgentAuth);
agentRouter.use("/email", getAgentEmailRateLimiter(), agentEmailRouter);
agentRouter.use("/customers", agentCustomersRouter);
agentRouter.use("/checkouts", agentCheckoutsRouter);
agentRouter.use("/support", agentSupportRouter);
