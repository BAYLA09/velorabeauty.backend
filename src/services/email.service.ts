import {
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
import { emailProvider } from "../email/email-provider.js";
import { logAiInteraction } from "./ai-audit.service.js";
import { checkEmailEligibility } from "./eligibility.service.js";
import { recordCustomerEvent } from "./customer-event.service.js";
import { logStructured } from "../lib/logger.js";
import { isMarketingEmailType } from "../lib/email-rules.js";

export type AgentSendEmailInput = {
  customerId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  type: EmailType;
  checkoutId?: string;
  campaignId?: string;
  model?: string;
  aiGenerated?: boolean;
  aiConfidence?: number;
  generationReason?: string;
  variant?: string;
  experimentId?: string;
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

  const eligibility = await checkEmailEligibility({
    customerId: customer.id,
    recipientEmail,
    type: input.type,
    checkoutId: input.checkoutId,
    campaignId: input.campaignId,
  });

  if (!eligibility.eligible) {
    logStructured("info", "email_send_blocked", {
      customerId: customer.id,
      code: eligibility.code,
      type: input.type,
    });
    return { success: false, reason: eligibility.reason, code: eligibility.code };
  }

  const env = loadEnv();
  const queued = await prisma.emailMessage.create({
    data: {
      customerId: customer.id,
      campaignId: input.campaignId,
      checkoutId: input.checkoutId,
      direction: EmailDirection.OUTBOUND,
      type: input.type,
      recipientEmail,
      senderEmail: env.EMAIL_FROM,
      subject: input.subject.trim(),
      body: input.body.trim(),
      status: EmailStatus.QUEUED,
      aiGenerated: input.aiGenerated ?? true,
      aiModel: input.model,
      aiConfidence: input.aiConfidence,
      generationReason: input.generationReason,
      variant: input.variant,
      experimentId: input.experimentId,
    },
  });

  try {
    const sent = await emailProvider.send({
      to: recipientEmail,
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO,
      subject: input.subject.trim(),
      body: input.body.trim(),
      unsubscribeUrl: isMarketingEmailType(input.type) ? env.EMAIL_UNSUBSCRIBE_URL : undefined,
    });

    const emailMessage = await prisma.emailMessage.update({
      where: { id: queued.id },
      data: {
        status: EmailStatus.SENT,
        providerMessageId: sent.providerMessageId,
        sentAt: new Date(),
      },
    });

    await recordCustomerEvent({
      customerId: customer.id,
      type: "EMAIL_SENT",
      metadata: {
        emailMessageId: emailMessage.id,
        type: input.type,
        campaignId: input.campaignId,
        checkoutId: input.checkoutId,
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
        campaignId: input.campaignId,
      },
      output: {
        success: true,
        emailMessageId: emailMessage.id,
        providerMessageId: sent.providerMessageId,
      },
      model: input.model,
    });

    logStructured("info", "email_send_success", {
      customerId: customer.id,
      emailMessageId: emailMessage.id,
      type: input.type,
    });

    return { success: true, emailMessage, providerMessageId: sent.providerMessageId };
  } catch (err) {
    await prisma.emailMessage.update({
      where: { id: queued.id },
      data: { status: EmailStatus.FAILED },
    });
    logStructured("error", "email_send_failed", { customerId: customer.id, emailMessageId: queued.id });
    if (err instanceof HttpError) {
      return { success: false, reason: err.message, code: err.code ?? "EMAIL_SEND_FAILED" };
    }
    return { success: false, reason: "Failed to send email", code: "EMAIL_SEND_FAILED" };
  }
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
      aiGenerated: false,
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
