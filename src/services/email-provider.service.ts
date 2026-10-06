import { loadEnv } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

export type SendEmailParams = {
  to: string;
  from: string;
  subject: string;
  body: string;
};

export type SendEmailResult = {
  providerMessageId: string;
};

export async function sendViaProvider(params: SendEmailParams): Promise<SendEmailResult> {
  const env = loadEnv();

  if (env.EMAIL_PROVIDER === "console") {
    console.info("[email:console]", {
      to: params.to,
      from: params.from,
      subject: params.subject,
      bodyLength: params.body.length,
    });
    return { providerMessageId: `console-${Date.now()}` };
  }

  if (env.EMAIL_PROVIDER === "sendgrid") {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: params.from },
        subject: params.subject,
        content: [{ type: "text/plain", value: params.body }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
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
