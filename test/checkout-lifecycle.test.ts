import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CheckoutStatus } from "@prisma/client";
import {
  abandonmentInstant,
  isCheckoutStale,
  planCheckoutWrite,
  planExplicitAbandon,
  planExplicitRecover,
} from "../src/services/checkout-lifecycle.js";
import { isPaidOrderStatus } from "../src/lib/order-status.js";
import { evaluateAbandonedCheckoutSequence } from "../src/services/eligibility.service.js";

describe("paid order statuses", () => {
  it("treats captured payments as paid", () => {
    for (const status of ["paid", "Paid", "PAID", "complete", "completed", "succeeded"]) {
      assert.equal(isPaidOrderStatus(status), true, status);
    }
  });

  it("does not treat in-progress checkout as paid", () => {
    for (const status of ["pending", "awaiting_payment", "cod", "unpaid", "failed"]) {
      assert.equal(isPaidOrderStatus(status), false, status);
    }
  });
});

describe("checkout upsert plan", () => {
  it("creates an active checkout until a paid order exists", () => {
    assert.equal(planCheckoutWrite(null, false), "create_active");
    assert.equal(planCheckoutWrite(null, true), "create_recovered");
  });

  it("updates an open cart without reopening a recovered checkout", () => {
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.ACTIVE }, false), "update_open");
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.ABANDONED }, false), "reactivate");
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.RECOVERED }, false), "keep");
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.RECOVERED }, true), "keep");
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.EXPIRED }, false), "keep");
  });

  it("recovers an open checkout when the linked order is already paid", () => {
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.ACTIVE }, true), "recover");
    assert.equal(planCheckoutWrite({ status: CheckoutStatus.ABANDONED }, true), "recover");
  });
});

describe("explicit abandon and recover", () => {
  it("abandons only an active checkout once", () => {
    assert.equal(planExplicitAbandon(CheckoutStatus.ACTIVE), "mark");
    assert.equal(planExplicitAbandon(CheckoutStatus.ABANDONED), "noop");
    assert.equal(planExplicitAbandon(CheckoutStatus.RECOVERED), "recovered");
    assert.equal(planExplicitAbandon(CheckoutStatus.EXPIRED), "rejected");
  });

  it("keeps the first recovered timestamp", () => {
    assert.equal(planExplicitRecover(CheckoutStatus.ACTIVE), "mark");
    assert.equal(planExplicitRecover(CheckoutStatus.ABANDONED), "mark");
    assert.equal(planExplicitRecover(CheckoutStatus.RECOVERED), "noop");
  });
});

describe("auto-abandon clock", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");
  const abandonAfterMinutes = 30;

  it("becomes stale at exactly the quiet period", () => {
    const justBefore = new Date(start.getTime() + 30 * 60_000 - 1);
    const exactly = new Date(start.getTime() + 30 * 60_000);
    assert.equal(isCheckoutStale(start, abandonAfterMinutes, justBefore), false);
    assert.equal(isCheckoutStale(start, abandonAfterMinutes, exactly), true);
  });

  it("backdates abandonedAt to the moment the quiet period elapsed", () => {
    const late = new Date(start.getTime() + 90 * 60_000);
    const instant = abandonmentInstant(start, abandonAfterMinutes, late);
    assert.equal(instant.toISOString(), "2026-06-01T00:30:00.000Z");
  });

  it("makes message 1 eligible 60 minutes after the last upsert and not sooner", () => {
    const sequenceAt = (elapsedMinutes: number) => {
      const now = new Date(start.getTime() + elapsedMinutes * 60_000);
      const abandonedAt = abandonmentInstant(start, abandonAfterMinutes, now);
      return evaluateAbandonedCheckoutSequence({
        status: CheckoutStatus.ABANDONED,
        abandonedAt,
        priorSuccessfulSends: 0,
        now,
        delayMinutes: 30,
        message2Hours: 24,
        message3Hours: 48,
      });
    };

    const tooSoon = sequenceAt(59);
    assert.equal(tooSoon.eligible, false);
    assert.equal(tooSoon.code, "ABANDONED_TIMING");
    assert.equal(tooSoon.abandonedCheckoutSequence, 1);

    const ready = sequenceAt(60);
    assert.equal(ready.eligible, true);
    assert.equal(ready.abandonedCheckoutSequence, 1);

    const sweptLate = sequenceAt(180);
    assert.equal(sweptLate.eligible, true);
    assert.equal(sweptLate.abandonedCheckoutSequence, 1);
  });
});
