import { Router } from "express";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isValidEmail, normalizeEmail } from "../lib/email-normalize.js";
import { verifyUnsubscribeToken } from "../lib/unsubscribe-token.js";
import { recordUnsubscribe as defaultRecordUnsubscribe } from "../services/customer.service.js";

export const unsubscribeRouter = Router();

type RecordUnsubscribeFn = (emailRaw: string, reason?: string) => Promise<void>;

let recordUnsubscribeImpl: RecordUnsubscribeFn = defaultRecordUnsubscribe;

/** Tests can inject a stub to avoid database access. */
export function setRecordUnsubscribeForTests(fn: RecordUnsubscribeFn | null): void {
  recordUnsubscribeImpl = fn ?? defaultRecordUnsubscribe;
}

const unsubscribeBodySchema = z.object({
  email: z.string().min(3).optional(),
  reason: z.string().optional(),
});

function readEmailAndToken(req: {
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
}): { email: string; token: string } {
  const queryEmail = typeof req.query.email === "string" ? req.query.email : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const bodyEmail = typeof req.body?.email === "string" ? req.body.email : undefined;

  const email = queryEmail ?? bodyEmail;
  const token = queryToken;
  if (!email || !token) {
    throw new HttpError(400, "email and token are required", "INVALID_UNSUBSCRIBE_REQUEST");
  }
  return { email, token };
}

function assertValidUnsubscribeToken(emailRaw: string, token: string): string {
  const env = loadEnv();
  if (!env.UNSUBSCRIBE_SECRET) {
    throw new HttpError(503, "Unsubscribe is not configured", "UNSUBSCRIBE_NOT_CONFIGURED");
  }
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    throw new HttpError(400, "Invalid email address", "INVALID_EMAIL");
  }
  if (!verifyUnsubscribeToken(email, token, env.UNSUBSCRIBE_SECRET)) {
    throw new HttpError(400, "Invalid unsubscribe token", "INVALID_UNSUBSCRIBE_TOKEN");
  }
  return email;
}

const successHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>إلغاء الاشتراك</title></head>
<body>
<p>تم إلغاء اشتراكك بنجاح. لن تصلك رسائل تسويقية من Velora Beauty بعد الآن.</p>
</body>
</html>`;

const invalidTokenHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>خطأ</title></head>
<body>
<p>رابط إلغاء الاشتراك غير صالح أو منتهي الصلاحية. يرجى التواصل مع الدعم إذا استمرت المشكلة.</p>
</body>
</html>`;

/** Public unsubscribe endpoint (linked from marketing emails). */
unsubscribeRouter.get("/", async (req, res, next) => {
  try {
    const { email, token } = readEmailAndToken(req);
    const normalized = assertValidUnsubscribeToken(email, token);
    await recordUnsubscribeImpl(normalized);
    res.status(200).type("html").send(successHtml);
  } catch (err) {
    if (err instanceof HttpError && err.code === "INVALID_UNSUBSCRIBE_TOKEN") {
      res.status(400).type("html").send(invalidTokenHtml);
      return;
    }
    next(err);
  }
});

unsubscribeRouter.post("/", async (req, res, next) => {
  try {
    const { email, token } = readEmailAndToken(req);
    const normalized = assertValidUnsubscribeToken(email, token);

    const contentType = String(req.headers["content-type"] ?? "");
    const isOneClick =
      contentType.includes("application/x-www-form-urlencoded") &&
      (req.body?.["List-Unsubscribe"] === "One-Click" ||
        req.body?.["list-unsubscribe"] === "One-Click");

    if (isOneClick) {
      await recordUnsubscribeImpl(normalized);
      res.status(200).send();
      return;
    }

    const body = unsubscribeBodySchema.parse(req.body ?? {});
    await recordUnsubscribeImpl(normalized, body.reason);
    res.json({ success: true, message: "You have been unsubscribed." });
  } catch (err) {
    next(err);
  }
});
