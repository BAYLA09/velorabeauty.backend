import { EmailType, SupportCategory, SupportTicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { requiresHumanReview } from "../lib/sensitive-topics.js";
import { recordInboundEmail, validateAndSendAgentEmail } from "./email.service.js";
import { getCustomerById } from "./customer.service.js";
import { logAiInteraction } from "./ai-audit.service.js";
import { recordCustomerEvent } from "./customer-event.service.js";

export async function handleInboundSupportEmail(params: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  providerMessageId?: string;
}) {
  const { customer, message } = await recordInboundEmail(params);
  const humanRequired = requiresHumanReview(`${params.subject}\n${params.body}`);

  const openTicket = await prisma.supportTicket.findFirst({
    where: {
      customerId: customer.id,
      status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.AI_HANDLED, SupportTicketStatus.HUMAN_REQUIRED] },
    },
    orderBy: { createdAt: "desc" },
  });

  let ticket;
  if (openTicket) {
    ticket = await prisma.supportTicket.update({
      where: { id: openTicket.id },
      data: {
        subject: params.subject,
        originalMessage: params.body,
        humanRequired: openTicket.humanRequired || humanRequired,
        status: humanRequired ? SupportTicketStatus.HUMAN_REQUIRED : openTicket.status,
      },
    });
  } else {
    ticket = await prisma.supportTicket.create({
      data: {
        customerId: customer.id,
        email: customer.email,
        subject: params.subject,
        originalMessage: params.body,
        humanRequired,
        status: humanRequired ? SupportTicketStatus.HUMAN_REQUIRED : SupportTicketStatus.OPEN,
      },
    });
  }

  await recordCustomerEvent({
    customerId: customer.id,
    type: "SUPPORT_MESSAGE",
    metadata: { ticketId: ticket.id, messageId: message.id },
  });

  return { customer, message, ticket };
}

export async function createSupportTicket(params: {
  customerId: string;
  subject: string;
  message: string;
  category?: SupportCategory;
}) {
  const customer = await getCustomerById(params.customerId);
  const humanRequired = requiresHumanReview(`${params.subject}\n${params.message}`);
  const ticket = await prisma.supportTicket.create({
    data: {
      customerId: customer.id,
      email: customer.email,
      subject: params.subject,
      originalMessage: params.message,
      category: params.category ?? SupportCategory.OTHER,
      humanRequired,
      status: humanRequired ? SupportTicketStatus.HUMAN_REQUIRED : SupportTicketStatus.OPEN,
    },
  });
  return ticket;
}

export async function getSupportTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new HttpError(404, "Support ticket not found", "TICKET_NOT_FOUND");
  return ticket;
}

export async function markTicketHumanRequired(ticketId: string, reason?: string) {
  const ticket = await getSupportTicket(ticketId);
  return prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      humanRequired: true,
      status: SupportTicketStatus.HUMAN_REQUIRED,
      aiResponse: reason ?? ticket.aiResponse,
    },
  });
}

export async function agentSupportReply(params: {
  customerId: string;
  ticketId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  aiConfidence?: number;
  model?: string;
}) {
  const customer = await getCustomerById(params.customerId);
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.ticketId, customerId: customer.id },
  });
  if (!ticket) {
    throw new HttpError(404, "Support ticket not found", "TICKET_NOT_FOUND");
  }

  if (ticket.status === SupportTicketStatus.CLOSED) {
    throw new HttpError(409, "Support ticket is closed", "TICKET_CLOSED");
  }

  if (ticket.aiResponse?.trim() === params.body.trim()) {
    return {
      sent: false,
      humanRequired: false,
      reason: "Duplicate support response already recorded for this ticket",
      code: "DUPLICATE_SUPPORT_REPLY",
    };
  }

  const combined = `${ticket.originalMessage}\n${params.body}`;
  const humanRequired =
    ticket.humanRequired || requiresHumanReview(combined) || (params.aiConfidence ?? 1) < 0.6;

  if (humanRequired) {
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        humanRequired: true,
        status: SupportTicketStatus.HUMAN_REQUIRED,
        aiResponse: params.body,
        aiConfidence: params.aiConfidence,
      },
    });

    await logAiInteraction({
      customerId: customer.id,
      type: "agent_support_reply_blocked",
      input: {
        ticketId: ticket.id,
        subject: params.subject,
        aiConfidence: params.aiConfidence,
      },
      output: { humanRequired: true },
      model: params.model,
    });

    return {
      sent: false,
      humanRequired: true,
      reason: "Sensitive or low-confidence case requires human review",
      ticket: updated,
    };
  }

  const sendResult = await validateAndSendAgentEmail({
    customerId: customer.id,
    recipientEmail: params.recipientEmail,
    subject: params.subject,
    body: params.body,
    type: EmailType.SUPPORT,
    model: params.model,
  });

  if (!sendResult.success) {
    return { sent: false, humanRequired: false, reason: sendResult.reason, code: sendResult.code };
  }

  const updatedTicket = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      aiResponse: params.body,
      aiConfidence: params.aiConfidence,
      status: SupportTicketStatus.AI_HANDLED,
    },
  });

  await recordCustomerEvent({
    customerId: customer.id,
    type: "SUPPORT_REPLY",
    metadata: { ticketId: ticket.id, emailMessageId: sendResult.emailMessage.id },
  });

  return {
    sent: true,
    humanRequired: false,
    emailMessage: sendResult.emailMessage,
    ticket: updatedTicket,
  };
}

export async function listSupportTickets(customerId: string) {
  await getCustomerById(customerId);
  return prisma.supportTicket.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
