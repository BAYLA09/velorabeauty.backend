import {
  CheckoutStatus,
  EmailCampaignStatus,
  EmailType,
  type Customer,
  type EmailCampaign,
} from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { isMarketingEmailType, countMarketingEmailsInWindow } from "../lib/email-rules.js";
import { isMarketingPausedGlobally } from "./system-settings.service.js";

export type EligibilityInput = {
  customerId: string;
  recipientEmail: string;
  type: EmailType;
  checkoutId?: string;
  campaignId?: string;
};

export type EligibilityResult = {
  eligible: boolean;
  code: string;
  reason: string;
  abandonedCheckoutSequence?: 1 | 2 | 3 | null;
};

const MARKETING_TYPES: EmailType[] = [
  EmailType.ABANDONED_CHECKOUT,
  EmailType.FOLLOW_UP,
  EmailType.OTHER,
];

export async function checkEmailEligibility(input: EligibilityInput): Promise<EligibilityResult> {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) {
    return { eligible: false, code: "CUSTOMER_NOT_FOUND", reason: "Customer does not exist" };
  }

  const suppressed = await prisma.emailSuppression.findUnique({
    where: { email: customer.email },
  });
  if (suppressed) {
    return {
      eligible: false,
      code: "SUPPRESSED",
      reason: "Recipient is on the suppression list",
    };
  }

  if (isMarketingEmailType(input.type)) {
    const marketing = await checkMarketingRules(customer, input);
    if (!marketing.eligible) return marketing;
  }

  if (input.campaignId) {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: input.campaignId } });
    if (!campaign) {
      return { eligible: false, code: "CAMPAIGN_NOT_FOUND", reason: "Campaign not found" };
    }
    const campaignCheck = validateCampaign(campaign);
    if (!campaignCheck.eligible) return campaignCheck;
  }

  if (input.type === EmailType.ABANDONED_CHECKOUT && input.checkoutId) {
    return checkAbandonedCheckoutSequence(customer, input.checkoutId);
  }

  return { eligible: true, code: "ELIGIBLE", reason: "Eligible to send" };
}

async function checkMarketingRules(
  customer: Customer,
  input: EligibilityInput,
): Promise<EligibilityResult> {
  if (await isMarketingPausedGlobally()) {
    return {
      eligible: false,
      code: "MARKETING_PAUSED",
      reason: "All marketing email is paused by admin",
    };
  }

  if (customer.unsubscribed) {
    return {
      eligible: false,
      code: "CUSTOMER_UNSUBSCRIBED",
      reason: "Customer has unsubscribed",
    };
  }

  if (!customer.marketingConsent) {
    return {
      eligible: false,
      code: "MARKETING_CONSENT_REQUIRED",
      reason: "Marketing consent is required",
    };
  }

  const env = loadEnv();
  const sentCount = await countMarketingEmailsInWindow(customer.id, 7);
  if (sentCount >= env.MAX_MARKETING_EMAILS_PER_7_DAYS) {
    return {
      eligible: false,
      code: "FREQUENCY_LIMIT",
      reason: `Maximum ${env.MAX_MARKETING_EMAILS_PER_7_DAYS} marketing emails per 7 days exceeded`,
    };
  }

  if (MARKETING_TYPES.includes(input.type)) {
    const duplicate = await prisma.emailMessage.findFirst({
      where: {
        customerId: customer.id,
        type: input.type,
        checkoutId: input.checkoutId ?? undefined,
        createdAt: { gte: new Date(Date.now() - env.DUPLICATE_EMAIL_WINDOW_MINUTES * 60_000) },
        status: { in: ["QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED"] },
      },
    });
    if (duplicate) {
      return {
        eligible: false,
        code: "DUPLICATE_EMAIL",
        reason: "Duplicate email recently sent",
      };
    }
  }

  return { eligible: true, code: "ELIGIBLE", reason: "Marketing rules passed" };
}

function validateCampaign(campaign: EmailCampaign): EligibilityResult {
  if (campaign.status === EmailCampaignStatus.PAUSED) {
    return { eligible: false, code: "CAMPAIGN_PAUSED", reason: "Campaign is paused" };
  }
  if (campaign.status !== EmailCampaignStatus.ACTIVE) {
    return {
      eligible: false,
      code: "CAMPAIGN_NOT_ACTIVE",
      reason: "Campaign must be ACTIVE to send",
    };
  }
  return { eligible: true, code: "ELIGIBLE", reason: "Campaign active" };
}

async function checkAbandonedCheckoutSequence(
  customer: Customer,
  checkoutId: string,
): Promise<EligibilityResult> {
  const env = loadEnv();
  const checkout = await prisma.checkout.findFirst({
    where: { id: checkoutId, customerId: customer.id },
  });

  if (!checkout) {
    return { eligible: false, code: "CHECKOUT_NOT_FOUND", reason: "Checkout not found" };
  }
  if (checkout.status === CheckoutStatus.RECOVERED) {
    return { eligible: false, code: "CHECKOUT_RECOVERED", reason: "Checkout already recovered" };
  }
  if (checkout.status !== CheckoutStatus.ABANDONED || !checkout.abandonedAt) {
    return { eligible: false, code: "CHECKOUT_NOT_ABANDONED", reason: "Checkout not abandoned" };
  }

  const priorSends = await prisma.emailMessage.count({
    where: {
      checkoutId,
      type: EmailType.ABANDONED_CHECKOUT,
      direction: "OUTBOUND",
      status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] },
    },
  });

  if (priorSends >= 3) {
    return {
      eligible: false,
      code: "ABANDONED_SEQUENCE_COMPLETE",
      reason: "All three abandoned checkout messages already sent",
    };
  }

  const elapsedMs = Date.now() - checkout.abandonedAt.getTime();
  const sequence = (priorSends + 1) as 1 | 2 | 3;
  const minMs =
    sequence === 1
      ? env.ABANDONED_CHECKOUT_DELAY_MINUTES * 60_000
      : sequence === 2
        ? env.ABANDONED_CHECKOUT_MESSAGE2_HOURS * 60 * 60_000
        : env.ABANDONED_CHECKOUT_MESSAGE3_HOURS * 60 * 60_000;

  if (elapsedMs < minMs) {
    return {
      eligible: false,
      code: "ABANDONED_TIMING",
      reason: `Too early for abandoned checkout message ${sequence}`,
      abandonedCheckoutSequence: sequence,
    };
  }

  return {
    eligible: true,
    code: "ELIGIBLE",
    reason: `Eligible for abandoned checkout message ${sequence}`,
    abandonedCheckoutSequence: sequence,
  };
}
