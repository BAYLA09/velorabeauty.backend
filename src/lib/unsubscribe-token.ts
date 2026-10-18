import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./email-normalize.js";

export function signUnsubscribeToken(email: string, secret: string): string {
  const normalized = normalizeEmail(email);
  return createHmac("sha256", secret).update(normalized).digest("base64url");
}

export function verifyUnsubscribeToken(email: string, token: string, secret: string): boolean {
  if (!token || !secret) return false;
  const expected = signUnsubscribeToken(email, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildSignedUnsubscribeUrl(baseUrl: string, email: string, secret: string): string {
  const token = signUnsubscribeToken(email, secret);
  const root = baseUrl.replace(/\/$/, "");
  const url = new URL(`${root}/api/unsubscribe`);
  url.searchParams.set("email", normalizeEmail(email));
  url.searchParams.set("token", token);
  return url.toString();
}
