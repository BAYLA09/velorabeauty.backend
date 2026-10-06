import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { EmailType, CustomerStatus } from "@prisma/client";
import { resetEnvCache } from "../src/config/env.js";
import { isMarketingEmailType } from "../src/lib/email-rules.js";
import { deriveCustomerStatus, computeStatsFromOrders } from "../src/services/customer-stats.service.js";

before(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GROK_AGENT_API_KEY = "test-grok-agent-key-32chars!";
  process.env.STORE_API_KEY = "test-store-api-key-32chars!!";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.EMAIL_REPLY_TO = "test@example.com";
  resetEnvCache();
});

describe("email rules", () => {
  it("treats abandoned checkout as marketing", () => {
    assert.equal(isMarketingEmailType(EmailType.ABANDONED_CHECKOUT), true);
    assert.equal(isMarketingEmailType(EmailType.SUPPORT), false);
  });
});

describe("customer status derivation", () => {
  it("marks unsubscribed customers", () => {
    const status = deriveCustomerStatus(
      { unsubscribed: true, marketingConsent: false, createdAt: new Date() },
      { totalOrders: 5, totalSpent: 1000, lastPurchaseAt: new Date() },
      [],
    );
    assert.equal(status, CustomerStatus.UNSUBSCRIBED);
  });

  it("computes order stats", () => {
    const stats = computeStatsFromOrders([
      {
        id: "1",
        customerId: "c",
        externalOrderId: "o1",
        totalAmount: 100 as never,
        currency: "USD",
        status: "paid",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
      {
        id: "2",
        customerId: "c",
        externalOrderId: "o2",
        totalAmount: 50 as never,
        currency: "USD",
        status: "paid",
        createdAt: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-01"),
      },
    ]);
    assert.equal(stats.totalOrders, 2);
    assert.equal(stats.totalSpent, 150);
    assert.equal(stats.averageOrderValue, 75);
  });
});
