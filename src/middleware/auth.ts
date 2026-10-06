import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env.js";

export function requireStoreAuth(req: Request, res: Response, next: NextFunction): void {
  if (!validateBearer(req, loadEnv().STORE_API_KEY)) {
    res.status(401).json({ error: "Unauthorized", code: "STORE_AUTH_REQUIRED" });
    return;
  }
  next();
}

export function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  if (!validateBearer(req, loadEnv().GROK_AGENT_API_KEY)) {
    res.status(401).json({ error: "Unauthorized", code: "AGENT_AUTH_REQUIRED" });
    return;
  }
  next();
}

function validateBearer(req: Request, expectedKey: string): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (!token || token.length !== expectedKey.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedKey.charCodeAt(i);
  }
  return mismatch === 0;
}
