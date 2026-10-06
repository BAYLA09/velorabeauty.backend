import type { NextFunction, Request, Response } from "express";
import { logStructured } from "../lib/logger.js";
import { logAiInteraction } from "../services/ai-audit.service.js";

export function logAgentToolCall(req: Request, _res: Response, next: NextFunction): void {
  logStructured("info", "agent_tool_call", {
    method: req.method,
    path: req.path,
    route: req.originalUrl.split("?")[0],
  });

  void logAiInteraction({
    type: "agent_tool_call",
    input: {
      method: req.method,
      path: req.originalUrl.split("?")[0],
    },
    output: { received: true },
  }).catch(() => undefined);

  next();
}
