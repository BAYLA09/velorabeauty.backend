import {
  CheckoutStatus,
  EmailDirection,
  EmailStatus,
  EmailType,
  type EmailMessage,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { isValidEmail, normalizeEmail } from "../lib/email-normalize.js";
import { loadEnv } from "../config/env.js";
import { getCustomerById } from "./customer.service.js";
import { sendViaProvider } from "./email-provider.service.js";
import { logAiInteraction } from "./ai-audit.service.js";

const MARKETING_TYPES: EmailType[] = [EmailType.ABANDONED_CHECKOUT, EmailType.FOLLOW_UP];

export type AgentSendEmailInput = {
  customerId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  type: EmailType;
  checkoutId?: string;
  model?: string;
};

export type AgentSendEmailResult = {
  success: true;
  emailMessage: EmailMessage;
  providerMessageId: string;
};

export type AgentSendEmailFailure = {
  success: false;
  reason: string;
  code: string;
};

export async function validateAndSendAgentEmail(
  input: AgentSendEmailInput,
): Promise<AgentSendEmailResult | AgentSendEmailFailure> {
  const recipientEmail = normalizeEmail(input.recipientEmail);

  if (!isValidEmail(recipientEmail)) {
    return { success: false, reason: "Recipient email is invalid", code: "INVALID_EMAIL" };
  }

  if (!input.subject.trim() || !input.body.trim()) {
    return { success: false, reason: "Subject and body are required", code: "MISSING_CONTENT" };
  }

  let customer;
  try {
    customer = await getCustomerById(input.customerId);
  } catch {
    return { success: false, reason: "Customer does not exist", code: "CUSTOMER_NOT_FOUND" };
  }

  if (normalizeEmail(customer.email) !== recipientEmail) {
    return {
      success: false,
      reason: "Recipient email does not match the customer record",
      code: "RECIPIENT_MISMATCH",
    };
  }

  if (customer.unsubscribed && MARKETING_TYPES.includes(input.type)) {
    return {
      success: false,
      reason: "Customer has unsubscribed from marketing emails",
      code: "CUSTOMER_UNSUBSCRIBED",
    };
  }

  if (MARKETING_TYPES.includes(input.type) && !customer.marketingConsent) {
    return {
      success: false,
      reason: "Marketing consent is required for this email type",
      code: "MARKETING_CONSENT_REQUIRED",
    };
  }

  if (input.type === EmailType.ABANDONED_CHECKOUT) {
    if (!input.checkoutId) {
      return {
        success: false,
        reason: "checkoutId is required for abandoned checkout emails",
        code: "CHECKOUT_ID_REQUIRED",
      };
    }
    const checkout = await prisma.checkout.findFirst({
      where: { id: input.checkoutId, customerId: customer.id },
    });
    if (!checkout) {
      return { success: false, reason: "Checkout not found for customer", code: "CHECKOUT_NOT_FOUND" };
    }
    if (checkout.status !== CheckoutStatus.ABANDONED) {
      return {
        success: false,
        reason: "Checkout is not eligible for abandoned checkout messaging",
        code: "CHECKOUT_NOT_ABANDONED",
      };
    }
  }

  if (input.checkoutId && input.type !== EmailType.ABANDONED_CHECKOUT) {
    const checkout = await prisma.checkout.findFirst({
      where: { id: input.checkoutId, customerId: customer.id },
    });
    if (!checkout) {
      return { success: false, reason: "Checkout not found for customer", code: "CHECKOUT_NOT_FOUND" };
    }
    if (checkout.status === CheckoutStatus.RECOVERED) {
      return {
        success: false,
        reason: "Checkout has been recovered; marketing is no longer allowed",
        code: "CHECKOUT_RECOVERED",
      };
    }
  }

  const duplicate = await findDuplicateOutboundEmail({
    customerId: customer.id,
    type: input.type,
    subject: input.subject.trim(),
    body: input.body.trim(),
    checkoutId: input.checkoutId,
  });
  if (duplicate) {
    return {
      success: false,
      reason: "An equivalent email was already sent recently",
      code: "DUPLICATE_EMAIL",
    };
  }

  const env = loadEnv();
  const queued = await prisma.emailMessage.create({
    data: {
      customerId: customer.id,
      checkoutId: input.checkoutId,
      direction: EmailDirection.OUTBOUND,
      type: input.type,
      recipientEmail,
      senderEmail: env.EMAIL_FROM,
      subject: input.subject.trim(),
      body: input.body.trim(),
      status: EmailStatus.QUEUED,
    },
  });

  try {
    const sent = await sendViaProvider({
      to: recipientEmail,
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO,
      subject: input.subject.trim(),
      body: input.body.trim(),
    });

    const emailMessage = await prisma.emailMessage.update({
      where: { id: queued.id },
      data: {
        status: EmailStatus.SENT,
        providerMessageId: sent.providerMessageId,
        sentAt: new Date(),
      },
    });

    await logAiInteraction({
      customerId: customer.id,
      type: "agent_email_send",
      input: {
        customerId: input.customerId,
        recipientEmail,
        subject: input.subject.trim(),
        type: input.type,
        checkoutId: input.checkoutId,
      },
      output: {
        success: true,
        emailMessageId: emailMessage.id,
        providerMessageId: sent.providerMessageId,
      },
      model: input.model,
    });

    return { success: true, emailMessage, providerMessageId: sent.providerMessageId };
  } catch (err) {
    await prisma.emailMessage.update({
      where: { id: queued.id },
      data: { status: EmailStatus.FAILED },
    });
    if (err instanceof HttpError) {
      return { success: false, reason: err.message, code: err.code ?? "EMAIL_SEND_FAILED" };
    }
    return { success: false, reason: "Failed to send email", code: "EMAIL_SEND_FAILED" };
  }
}

async function findDuplicateOutboundEmail(params: {
  customerId: string;
  type: EmailType;
  subject: string;
  body: string;
  checkoutId?: string;
}): Promise<EmailMessage | null> {
  const windowStart = new Date(
    Date.now() - loadEnv().DUPLICATE_EMAIL_WINDOW_MINUTES * 60_000,
  );

  return prisma.emailMessage.findFirst({
    where: {
      customerId: params.customerId,
      direction: EmailDirection.OUTBOUND,
      type: params.type,
      subject: params.subject,
      body: params.body,
      checkoutId: params.checkoutId ?? null,
      createdAt: { gte: windowStart },
      status: { in: [EmailStatus.QUEUED, EmailStatus.SENT, EmailStatus.DELIVERED, EmailStatus.OPENED, EmailStatus.CLICKED] },
    },
  });
}

export async function recordInboundEmail(params: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  providerMessageId?: string;
}) {
  const senderEmail = normalizeEmail(params.senderEmail);
  const recipientEmail = normalizeEmail(params.recipientEmail);

  if (!isValidEmail(senderEmail)) {
    throw new HttpError(400, "Invalid sender email", "INVALID_EMAIL");
  }

  const customer =
    (await prisma.customer.findUnique({ where: { email: senderEmail } })) ??
    (await prisma.customer.create({
      data: { email: senderEmail },
    }));

  const message = await prisma.emailMessage.create({
    data: {
      customerId: customer.id,
      direction: EmailDirection.INBOUND,
      type: EmailType.SUPPORT,
      recipientEmail,
      senderEmail,
      subject: params.subject.trim(),
      body: params.body.trim(),
      providerMessageId: params.providerMessageId,
      status: EmailStatus.DELIVERED,
      deliveredAt: new Date(),
    },
  });

  return { customer, message };
}

export async function listEmailHistory(customerId: string, limit = 100) {
  await getCustomerById(customerId);
  return prisma.emailMessage.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
