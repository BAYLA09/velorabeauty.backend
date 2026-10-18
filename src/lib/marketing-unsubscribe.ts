import type { Env } from "../config/env.js";
import { buildSignedUnsubscribeUrl } from "./unsubscribe-token.js";

export function resolveMarketingUnsubscribeUrl(
  recipientEmail: string,
  env: Env,
): { url: string } | { code: "UNSUBSCRIBE_NOT_CONFIGURED" } {
  if (env.UNSUBSCRIBE_SECRET) {
    return {
      url: buildSignedUnsubscribeUrl(env.PUBLIC_API_BASE_URL, recipientEmail, env.UNSUBSCRIBE_SECRET),
    };
  }
  if (env.EMAIL_UNSUBSCRIBE_URL) {
    return { url: env.EMAIL_UNSUBSCRIBE_URL };
  }
  return { code: "UNSUBSCRIBE_NOT_CONFIGURED" };
}
