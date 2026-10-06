import { Router } from "express";
import { requireAgentAuth } from "../../middleware/auth.js";
import { getAgentEmailRateLimiter } from "../../middleware/rateLimit.js";
import { logAgentToolCall } from "../../middleware/agent-audit.js";
import { agentCustomersRouter } from "./customers.js";
import { agentCheckoutsRouter } from "./checkouts.js";
import { agentEmailRouter } from "./email.js";
import { agentSupportRouter } from "./support.js";
import { agentSegmentsRouter } from "./segments.js";
import { agentCampaignsRouter } from "./campaigns.js";
import { agentMetricsRouter } from "./metrics.js";
import { agentEventsRouter } from "./events.js";

export const agentRouter = Router();

agentRouter.use(requireAgentAuth);
agentRouter.use(logAgentToolCall);

agentRouter.use("/email", getAgentEmailRateLimiter(), agentEmailRouter);
agentRouter.use("/customers", agentCustomersRouter);
agentRouter.use("/checkouts", agentCheckoutsRouter);
agentRouter.use("/support", agentSupportRouter);
agentRouter.use("/segments", agentSegmentsRouter);
agentRouter.use("/campaigns", agentCampaignsRouter);
agentRouter.use("/metrics", agentMetricsRouter);
agentRouter.use("/events", agentEventsRouter);
