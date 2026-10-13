import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadEnv, resetEnvCache } from "../src/config/env.js";
import { HttpError } from "../src/middleware/errorHandler.js";
import {
  buildSmtpTransportOptions,
  emailProvider,
  resetEmailProviderForTests,
  setSmtpMailerFactoryForTests,
} from "../src/email/email-provider.js";

const originalFetch = globalThis.fetch;

function applyBaseEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GROK_AGENT_API_KEY = "test-grok-agent-key-32chars!";
  process.env.STORE_API_KEY = "test-store-api-key-32chars!!";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  process.env.EMAIL_PROVIDER = "console";
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_UNSUBSCRIBE_URL;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.CHECKOUT_ABANDON_AFTER_MINUTES;
  resetEnvCache();
  resetEmailProviderForTests();
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  applyBaseEnv();
});

describe("email env", () => {
  it("defaults to console and does not require a provider key", () => {
    applyBaseEnv();
    delete process.env.EMAIL_PROVIDER;
    resetEnvCache();
    const env = loadEnv();
    assert.equal(env.EMAIL_PROVIDER, "console");
    assert.equal(env.CHECKOUT_ABANDON_AFTER_MINUTES, 30);
    assert.equal(env.MAX_MARKETING_EMAILS_PER_7_DAYS, 3);
    assert.equal(env.DUPLICATE_EMAIL_WINDOW_MINUTES, 60);
    assert.equal(env.ABANDONED_CHECKOUT_DELAY_MINUTES, 30);
    assert.equal(env.ABANDONED_CHECKOUT_MESSAGE2_HOURS, 24);
    assert.equal(env.ABANDONED_CHECKOUT_MESSAGE3_HOURS, 48);
  });

  it("refuses a blank provider instead of silently logging", () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "";
    resetEnvCache();
    assert.throws(() => loadEnv(), /Invalid environment configuration/);
  });

  it("requires a SendGrid key only for the sendgrid provider", () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    resetEnvCache();
    assert.throws(() => loadEnv(), /EMAIL_API_KEY is required when EMAIL_PROVIDER=sendgrid/);
  });

  it("requires SMTP host, user, and password together", () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    resetEnvCache();
    assert.throws(() => loadEnv(), /SMTP provider requires SMTP_USER, SMTP_PASSWORD/);
  });

  it("uses STARTTLS on 587 and implicit TLS on 465 unless overridden", () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailbox@example.com";
    process.env.SMTP_PASSWORD = "test-smtp-password";
    process.env.SMTP_PORT = "587";
    resetEnvCache();
    const startTls = loadEnv();
    assert.equal(startTls.SMTP_SECURE, false);
    assert.deepEqual(buildSmtpTransportOptions(startTls), {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "mailbox@example.com", pass: "test-smtp-password" },
    });

    process.env.SMTP_PORT = "465";
    delete process.env.SMTP_SECURE;
    resetEnvCache();
    assert.equal(loadEnv().SMTP_SECURE, true);

    process.env.SMTP_SECURE = "false";
    resetEnvCache();
    assert.equal(loadEnv().SMTP_SECURE, false);
  });
});

describe("email provider", () => {
  const message = {
    to: "baylaamine@gmail.com",
    from: "test@example.com",
    replyTo: "reply@example.com",
    subject: "You left something with Velora",
    body: "Your cart is still here.",
    unsubscribeUrl: "https://example.com/api/unsubscribe",
  };

  it("logs a console send and does not call the network", async () => {
    applyBaseEnv();
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response(null, { status: 500 });
    };
    const result = await emailProvider.send(message);
    assert.equal(fetched, false);
    assert.match(result.providerMessageId, /^console-/);
  });

  it("posts to SendGrid with the unsubscribe footer", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.EMAIL_API_KEY = "SG.test-key";
    process.env.EMAIL_UNSUBSCRIBE_URL = message.unsubscribeUrl;
    resetEnvCache();

    let captured: { url: string; authorization: string; body: string } | undefined;
    globalThis.fetch = async (input, init) => {
      captured = {
        url: String(input),
        authorization: String((init?.headers as Record<string, string>).Authorization),
        body: String(init?.body),
      };
      return new Response(null, { status: 202, headers: { "x-message-id": "sg-test-id" } });
    };

    const result = await emailProvider.send(message);
    assert.equal(result.providerMessageId, "sg-test-id");
    assert.equal(captured?.url, "https://api.sendgrid.com/v3/mail/send");
    assert.equal(captured?.authorization, "Bearer SG.test-key");
    const payload = JSON.parse(captured?.body ?? "{}") as {
      subject: string;
      content: Array<{ value: string }>;
    };
    assert.equal(payload.subject, message.subject);
    assert.match(payload.content[0].value, /Unsubscribe: https:\/\/example.com\/api\/unsubscribe/);
  });

  it("turns a SendGrid rejection into an email provider error", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.EMAIL_API_KEY = "SG.test-key";
    resetEnvCache();
    globalThis.fetch = async () => new Response("nope", { status: 403 });

    await assert.rejects(
      () => emailProvider.send(message),
      (err: unknown) => err instanceof HttpError && err.statusCode === 502 && err.code === "EMAIL_PROVIDER_ERROR",
    );
  });

  it("sends through an injected SMTP mailer and hides transport errors", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailbox@example.com";
    process.env.SMTP_PASSWORD = "test-smtp-password";
    resetEnvCache();

    let text = "";
    setSmtpMailerFactoryForTests(() => ({
      async sendMail(mail) {
        text = mail.text;
        return { messageId: "smtp-test-id" };
      },
    }));

    const sent = await emailProvider.send(message);
    assert.equal(sent.providerMessageId, "smtp-test-id");
    assert.match(text, /Unsubscribe: https:\/\/example.com\/api\/unsubscribe/);

    setSmtpMailerFactoryForTests(() => ({
      async sendMail() {
        throw new Error("535 authentication failed for mailbox@example.com");
      },
    }));
    await assert.rejects(
      () => emailProvider.send(message),
      (err: unknown) =>
        err instanceof HttpError &&
        err.code === "EMAIL_PROVIDER_ERROR" &&
        !err.message.includes("535") &&
        !err.message.includes("mailbox@example.com"),
    );
  });
});
