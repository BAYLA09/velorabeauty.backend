import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CheckoutStatus } from "@prisma/client";
import {
  evaluateAbandonedCheckoutSequence,
  evaluateMarketingGate,
} from "../src/services/eligibility.service.js";

const abandonedAt = new Date("2026-06-01T00:00:00.000Z");

function sequence(overrides: {
  status?: CheckoutStatus;
  abandonedAt?: Date | null;
  priorSuccessfulSends?: number;
  now: Date;
}) {
  return evaluateAbandonedCheckoutSequence({
    status: overrides.status ?? CheckoutStatus.ABANDONED,
    abandonedAt: overrides.abandonedAt === undefined ? abandonedAt : overrides.abandonedAt,
    priorSuccessfulSends: overrides.priorSuccessfulSends ?? 0,
    now: overrides.now,
    delayMinutes: 30,
    message2Hours: 24,
    message3Hours: 48,
  });
}

describe("marketing gate order", () => {
  const open = {
    marketingPaused: false,
    unsubscribed: false,
    marketingConsent: true,
    sentCount: 0,
    maxPer7Days: 3,
    duplicate: false,
  };

  it("stops on pause before unsubscribe or consent", () => {
    const result = evaluateMarketingGate({
      ...open,
      marketingPaused: true,
      unsubscribed: true,
      marketingConsent: false,
    });
    assert.equal(result.code, "MARKETING_PAUSED");
  });

  it("stops on unsubscribe before consent and frequency", () => {
    const result = evaluateMarketingGate({
      ...open,
      unsubscribed: true,
      marketingConsent: false,
      sentCount: 9,
    });
    assert.equal(result.code, "CUSTOMER_UNSUBSCRIBED");
  });

  it("requires consent before the frequency cap", () => {
    const result = evaluateMarketingGate({
      ...open,
      marketingConsent: false,
      sentCount: 3,
      duplicate: true,
    });
    assert.equal(result.code, "MARKETING_CONSENT_REQUIRED");
  });

  it("blocks the fourth marketing send in seven days", () => {
    assert.equal(evaluateMarketingGate({ ...open, sentCount: 2 }).eligible, true);
    const blocked = evaluateMarketingGate({ ...open, sentCount: 3 });
    assert.equal(blocked.eligible, false);
    assert.equal(blocked.code, "FREQUENCY_LIMIT");
  });

  it("blocks a duplicate after the frequency check passes", () => {
    const result = evaluateMarketingGate({ ...open, sentCount: 1, duplicate: true });
    assert.equal(result.code, "DUPLICATE_EMAIL");
  });
});

describe("abandoned checkout sequence", () => {
  it("stops the sequence when the checkout is recovered", () => {
    const result = sequence({
      status: CheckoutStatus.RECOVERED,
      now: new Date(abandonedAt.getTime() + 48 * 60 * 60_000),
      priorSuccessfulSends: 1,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.code, "CHECKOUT_RECOVERED");
  });

  it("rejects a checkout that is not abandoned", () => {
    const active = sequence({ status: CheckoutStatus.ACTIVE, now: abandonedAt });
    assert.equal(active.code, "CHECKOUT_NOT_ABANDONED");
    const missingTime = sequence({ abandonedAt: null, now: abandonedAt });
    assert.equal(missingTime.code, "CHECKOUT_NOT_ABANDONED");
  });

  it("waits 30 minutes, then 24 hours, then 48 hours", () => {
    const message1Early = sequence({ now: new Date(abandonedAt.getTime() + 30 * 60_000 - 1) });
    assert.equal(message1Early.code, "ABANDONED_TIMING");
    assert.equal(message1Early.abandonedCheckoutSequence, 1);

    const message1 = sequence({ now: new Date(abandonedAt.getTime() + 30 * 60_000) });
    assert.equal(message1.eligible, true);
    assert.equal(message1.abandonedCheckoutSequence, 1);

    const message2Early = sequence({
      priorSuccessfulSends: 1,
      now: new Date(abandonedAt.getTime() + 24 * 60 * 60_000 - 1),
    });
    assert.equal(message2Early.code, "ABANDONED_TIMING");
    assert.equal(message2Early.abandonedCheckoutSequence, 2);

    const message2 = sequence({
      priorSuccessfulSends: 1,
      now: new Date(abandonedAt.getTime() + 24 * 60 * 60_000),
    });
    assert.equal(message2.eligible, true);
    assert.equal(message2.abandonedCheckoutSequence, 2);

    const message3Early = sequence({
      priorSuccessfulSends: 2,
      now: new Date(abandonedAt.getTime() + 48 * 60 * 60_000 - 1),
    });
    assert.equal(message3Early.code, "ABANDONED_TIMING");
    assert.equal(message3Early.abandonedCheckoutSequence, 3);

    const message3 = sequence({
      priorSuccessfulSends: 2,
      now: new Date(abandonedAt.getTime() + 48 * 60 * 60_000),
    });
    assert.equal(message3.eligible, true);
    assert.equal(message3.abandonedCheckoutSequence, 3);
  });

  it("stops after three successful sends", () => {
    const result = sequence({
      priorSuccessfulSends: 3,
      now: new Date(abandonedAt.getTime() + 72 * 60 * 60_000),
    });
    assert.equal(result.code, "ABANDONED_SEQUENCE_COMPLETE");
  });
});
