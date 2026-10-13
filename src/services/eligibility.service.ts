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

export type MarketingGateInput = {
  marketingPaused: boolean;
  unsubscribed: boolean;
  marketingConsent: boolean;
  sentCount: number;
  maxPer7Days: number;
  duplicate: boolean;
};

/** Ordered marketing blocks. A passing result means the remaining send checks may run. */
export function evaluateMarketingGate(input: MarketingGateInput): EligibilityResult {
  if (input.marketingPaused) {
    return {
      eligible: false,
      code: "MARKETING_PAUSED",
      reason: "All marketing email is paused by admin",
    };
  }

  if (input.unsubscribed) {
    return {
      eligible: false,
      code: "CUSTOMER_UNSUBSCRIBED",
      reason: "Customer has unsubscribed",
    };
  }

  if (!input.marketingConsent) {
    return {
      eligible: false,
      code: "MARKETING_CONSENT_REQUIRED",
      reason: "Marketing consent is required",
    };
  }

  if (input.sentCount >= input.maxPer7Days) {
    return {
      eligible: false,
      code: "FREQUENCY_LIMIT",
      reason: `Maximum ${input.maxPer7Days} marketing emails per 7 days exceeded`,
    };
  }

  if (input.duplicate) {
    return {
      eligible: false,
      code: "DUPLICATE_EMAIL",
      reason: "Duplicate email recently sent",
    };
  }

  return { eligible: true, code: "ELIGIBLE", reason: "Marketing rules passed" };
}

export type AbandonedSequenceInput = {
  status: CheckoutStatus;
  abandonedAt: Date | null;
  priorSuccessfulSends: number;
  now: Date;
  delayMinutes: number;
  message2Hours: number;
  message3Hours: number;
};

/** Sequence clock starts at abandonedAt. Message 1 / 2 / 3 use the delay, 24h, and 48h env values. */
export function evaluateAbandonedCheckoutSequence(input: AbandonedSequenceInput): EligibilityResult {
  if (input.status === CheckoutStatus.RECOVERED) {
    return { eligible: false, code: "CHECKOUT_RECOVERED", reason: "Checkout already recovered" };
  }
  if (input.status !== CheckoutStatus.ABANDONED || !input.abandonedAt) {
    return { eligible: false, code: "CHECKOUT_NOT_ABANDONED", reason: "Checkout not abandoned" };
  }

  if (input.priorSuccessfulSends >= 3) {
    return {
      eligible: false,
      code: "ABANDONED_SEQUENCE_COMPLETE",
      reason: "All three abandoned checkout messages already sent",
    };
  }

  const elapsedMs = input.now.getTime() - input.abandonedAt.getTime();
  const sequence = (input.priorSuccessfulSends + 1) as 1 | 2 | 3;
  const minMs =
    sequence === 1
      ? input.delayMinutes * 60_000
      : sequence === 2
        ? input.message2Hours * 60 * 60_000
        : input.message3Hours * 60 * 60_000;

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
    return evaluateMarketingGate({
      marketingPaused: true,
      unsubscribed: customer.unsubscribed,
      marketingConsent: customer.marketingConsent,
      sentCount: 0,
      maxPer7Days: loadEnv().MAX_MARKETING_EMAILS_PER_7_DAYS,
      duplicate: false,
    });
  }

  const env = loadEnv();
  const sentCount = await countMarketingEmailsInWindow(customer.id, 7);
  let duplicate = false;
  if (MARKETING_TYPES.includes(input.type) && sentCount < env.MAX_MARKETING_EMAILS_PER_7_DAYS) {
    if (customer.marketingConsent && !customer.unsubscribed) {
      const existing = await prisma.emailMessage.findFirst({
        where: {
          customerId: customer.id,
          type: input.type,
          checkoutId: input.checkoutId ?? undefined,
          createdAt: { gte: new Date(Date.now() - env.DUPLICATE_EMAIL_WINDOW_MINUTES * 60_000) },
          status: { in: ["QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED"] },
        },
      });
      duplicate = Boolean(existing);
    }
  }

  return evaluateMarketingGate({
    marketingPaused: false,
    unsubscribed: customer.unsubscribed,
    marketingConsent: customer.marketingConsent,
    sentCount,
    maxPer7Days: env.MAX_MARKETING_EMAILS_PER_7_DAYS,
    duplicate,
  });
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

  const needsSendCount =
    checkout.status === CheckoutStatus.ABANDONED && checkout.abandonedAt !== null;
  const priorSuccessfulSends = needsSendCount
    ? await prisma.emailMessage.count({
        where: {
          checkoutId,
          type: EmailType.ABANDONED_CHECKOUT,
          direction: "OUTBOUND",
          status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] },
        },
      })
    : 0;

  return evaluateAbandonedCheckoutSequence({
    status: checkout.status,
    abandonedAt: checkout.abandonedAt,
    priorSuccessfulSends,
    now: new Date(),
    delayMinutes: env.ABANDONED_CHECKOUT_DELAY_MINUTES,
    message2Hours: env.ABANDONED_CHECKOUT_MESSAGE2_HOURS,
    message3Hours: env.ABANDONED_CHECKOUT_MESSAGE3_HOURS,
  });
}
