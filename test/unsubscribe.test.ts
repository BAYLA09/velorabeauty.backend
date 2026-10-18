import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { resetEnvCache } from "../src/config/env.js";
import {
  buildSignedUnsubscribeUrl,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/lib/unsubscribe-token.js";
import { resolveMarketingUnsubscribeUrl } from "../src/lib/marketing-unsubscribe.js";
import { loadEnv } from "../src/config/env.js";

const TEST_SECRET = "test-unsubscribe-secret-32chars-min!!";
const originalFetch = globalThis.fetch;

function applyBaseEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GROK_AGENT_API_KEY = "test-grok-agent-key-32chars!";
  process.env.STORE_API_KEY = "test-store-api-key-32chars!!";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  process.env.EMAIL_PROVIDER = "console";
  process.env.UNSUBSCRIBE_SECRET = TEST_SECRET;
  process.env.PUBLIC_API_BASE_URL = "https://api.example.test";
  delete process.env.EMAIL_UNSUBSCRIBE_URL;
  resetEnvCache();
}

describe("unsubscribe token", () => {
  it("signs and verifies normalized email", () => {
    const token = signUnsubscribeToken("User@Example.COM", TEST_SECRET);
    assert.equal(verifyUnsubscribeToken("user@example.com", token, TEST_SECRET), true);
    assert.equal(verifyUnsubscribeToken("user@example.com", "bad-token", TEST_SECRET), false);
  });

  it("builds a signed GET URL", () => {
    const url = buildSignedUnsubscribeUrl("https://api.example.test", "a@b.co", TEST_SECRET);
    assert.match(url, /^https:\/\/api\.example\.test\/api\/unsubscribe\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("email"), "a@b.co");
    const token = parsed.searchParams.get("token");
    assert.ok(token);
    assert.equal(verifyUnsubscribeToken("a@b.co", token!, TEST_SECRET), true);
  });

  it("prefers signed URLs when the secret is configured", () => {
    applyBaseEnv();
    const env = loadEnv();
    const resolved = resolveMarketingUnsubscribeUrl("shopper@example.com", env);
    assert.ok(!("code" in resolved));
    assert.match(resolved.url, /token=/);
  });

  it("falls back to EMAIL_UNSUBSCRIBE_URL without a secret", () => {
    applyBaseEnv();
    delete process.env.UNSUBSCRIBE_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_URL = "https://legacy.example/unsub";
    resetEnvCache();
    const env = loadEnv();
    const resolved = resolveMarketingUnsubscribeUrl("shopper@example.com", env);
    assert.deepEqual(resolved, { url: "https://legacy.example/unsub" });
  });

  it("fails closed when unsubscribe is not configured", () => {
    applyBaseEnv();
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.EMAIL_UNSUBSCRIBE_URL;
    resetEnvCache();
    const env = loadEnv();
    const resolved = resolveMarketingUnsubscribeUrl("shopper@example.com", env);
    assert.deepEqual(resolved, { code: "UNSUBSCRIBE_NOT_CONFIGURED" });
  });
});

describe("unsubscribe routes", () => {
  let server: Server;
  let baseUrl = "";
  const recordCalls: { email: string; reason?: string }[] = [];

  before(async () => {
    applyBaseEnv();
    const { setRecordUnsubscribeForTests } = await import("../src/routes/unsubscribe.js");
    setRecordUnsubscribeForTests(async (email: string, reason?: string) => {
      recordCalls.push({ email, reason });
    });
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    const { setRecordUnsubscribeForTests } = await import("../src/routes/unsubscribe.js");
    setRecordUnsubscribeForTests(null);
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterEach(() => {
    recordCalls.length = 0;
    globalThis.fetch = originalFetch;
  });

  it("GET returns Arabic success HTML for a valid token", async () => {
    const token = signUnsubscribeToken("reader@example.com", TEST_SECRET);
    const response = await fetch(
      `${baseUrl}/api/unsubscribe?email=reader@example.com&token=${encodeURIComponent(token)}`,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /تم إلغاء اشتراكك بنجاح/);
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0]?.email, "reader@example.com");
  });

  it("GET is idempotent and returns success HTML again", async () => {
    const token = signUnsubscribeToken("again@example.com", TEST_SECRET);
    const url = `${baseUrl}/api/unsubscribe?email=again@example.com&token=${encodeURIComponent(token)}`;
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    assert.equal(recordCalls.length, 2);
  });

  it("GET returns Arabic error HTML for a bad token", async () => {
    const response = await fetch(
      `${baseUrl}/api/unsubscribe?email=reader@example.com&token=not-valid`,
    );
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /غير صالح/);
    assert.equal(recordCalls.length, 0);
  });

  it("POST one-click unsubscribes with RFC 8058 form body", async () => {
    const token = signUnsubscribeToken("oneclick@example.com", TEST_SECRET);
    const response = await fetch(
      `${baseUrl}/api/unsubscribe?email=oneclick@example.com&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      },
    );
    assert.equal(response.status, 200);
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0]?.email, "oneclick@example.com");
  });

  it("JSON POST requires a valid token", async () => {
    const token = signUnsubscribeToken("json@example.com", TEST_SECRET);
    const ok = await fetch(
      `${baseUrl}/api/unsubscribe?email=json@example.com&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "json@example.com", reason: "test" }),
      },
    );
    assert.equal(ok.status, 200);
    const bad = await fetch(`${baseUrl}/api/unsubscribe?email=json@example.com&token=bad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "json@example.com" }),
    });
    assert.equal(bad.status, 400);
  });
});
