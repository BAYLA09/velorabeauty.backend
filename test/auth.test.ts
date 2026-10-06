import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { requiresHumanReview } from "../src/lib/sensitive-topics.js";
import { resetEnvCache } from "../src/config/env.js";

before(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GROK_AGENT_API_KEY = "test-grok-agent-key-32chars!";
  process.env.STORE_API_KEY = "test-store-api-key-32chars!!";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.EMAIL_REPLY_TO = "test@example.com";
  resetEnvCache();
});

describe("support escalation", () => {
  it("flags refund requests for human review", () => {
    assert.equal(requiresHumanReview("I need a refund for my order"), true);
  });

  it("allows general product questions", () => {
    assert.equal(requiresHumanReview("What shade is best for dry skin?"), false);
  });
});
