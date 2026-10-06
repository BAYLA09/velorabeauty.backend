import { loadEnv } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { logStructured } from "../lib/logger.js";

export type SendEmailParams = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  body: string;
  unsubscribeUrl?: string;
};

export type SendEmailResult = {
  providerMessageId: string;
};

/** Backend-owned email delivery (Grok never calls the provider directly). */
export class EmailProvider {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const env = loadEnv();
    const body = appendUnsubscribeFooter(params.body, params.unsubscribeUrl);

    if (env.EMAIL_PROVIDER === "console") {
      logStructured("info", "email_send_console", {
        to: params.to,
        from: params.from,
        subject: params.subject,
        bodyLength: body.length,
      });
      return { providerMessageId: `console-${Date.now()}` };
    }

    if (env.EMAIL_PROVIDER === "sendgrid") {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: params.to }] }],
          from: { email: params.from },
          reply_to: { email: params.replyTo },
          subject: params.subject,
          content: [{ type: "text/plain", value: body }],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logStructured("error", "email_provider_error", { status: response.status });
        throw new HttpError(502, "Email provider rejected the message", "EMAIL_PROVIDER_ERROR", {
          status: response.status,
          body: text.slice(0, 500),
        });
      }

      const messageId = response.headers.get("x-message-id") ?? `sendgrid-${Date.now()}`;
      return { providerMessageId: messageId };
    }

    throw new HttpError(500, "Email provider not configured", "EMAIL_PROVIDER_NOT_CONFIGURED");
  }
}

function appendUnsubscribeFooter(body: string, unsubscribeUrl?: string): string {
  if (!unsubscribeUrl) return body;
  return `${body.trim()}\n\n---\nUnsubscribe: ${unsubscribeUrl}`;
}

export const emailProvider = new EmailProvider();
