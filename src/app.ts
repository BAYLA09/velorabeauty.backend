import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { customersRouter } from "./routes/customers.js";
import { checkoutsRouter } from "./routes/checkouts.js";
import { ordersRouter } from "./routes/orders.js";
import { supportRouter } from "./routes/support.js";
import { unsubscribeRouter } from "./routes/unsubscribe.js";
import { agentRouter } from "./routes/agent/index.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/checkouts", checkoutsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/unsubscribe", unsubscribeRouter);
  app.use("/api/agent", agentRouter);

  app.use(errorHandler);
  return app;
}
