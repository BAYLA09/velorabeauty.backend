import { Router } from "express";
import { loadEnv } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const emailProvider = loadEnv().EMAIL_PROVIDER;
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected", emailProvider });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable", emailProvider });
  }
});
