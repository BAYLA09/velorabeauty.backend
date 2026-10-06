import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { loadEnv } from "../config/env.js";

let agentEmailRateLimiter: RateLimitRequestHandler | null = null;

export function getAgentEmailRateLimiter(): RateLimitRequestHandler {
  if (!agentEmailRateLimiter) {
    const env = loadEnv();
    agentEmailRateLimiter = rateLimit({
      windowMs: env.AGENT_EMAIL_RATE_LIMIT_WINDOW_MS,
      max: env.AGENT_EMAIL_RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: "Agent email rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED",
      },
    });
  }
  return agentEmailRateLimiter;
}
