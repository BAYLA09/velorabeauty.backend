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
import { buildSignedUnsubscribeUrl } from "../src/lib/unsubscribe-token.js";

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
    delete process.env.PUBLIC_API_BASE_URL;
    resetEnvCache();
    const env = loadEnv();
    assert.equal(env.EMAIL_PROVIDER, "console");
    assert.equal(env.PUBLIC_API_BASE_URL, "https://api.velorabeauty.world");
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

  it("rejects UNSUBSCRIBE_SECRET shorter than 32 characters", () => {
    applyBaseEnv();
    process.env.UNSUBSCRIBE_SECRET = "too-short";
    resetEnvCache();
    assert.throws(() => loadEnv(), /Invalid environment configuration/);
  });
});

describe("email provider", () => {
  const unsubscribeUrl = buildSignedUnsubscribeUrl(
    "https://api.example.test",
    "baylaamine@gmail.com",
    TEST_SECRET,
  );

  const marketingMessage = {
    to: "baylaamine@gmail.com",
    from: "test@example.com",
    replyTo: "reply@example.com",
    subject: "You left something with Velora",
    body: "Your cart is still here.",
    unsubscribeUrl,
  };

  const supportMessage = {
    to: "baylaamine@gmail.com",
    from: "test@example.com",
    replyTo: "reply@example.com",
    subject: "Support reply",
    body: "We received your message.",
  };

  it("logs a console send and does not call the network", async () => {
    applyBaseEnv();
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response(null, { status: 500 });
    };
    const result = await emailProvider.send(marketingMessage);
    assert.equal(fetched, false);
    assert.match(result.providerMessageId, /^console-/);
  });

  it("posts to SendGrid with multipart content and List-Unsubscribe headers", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.EMAIL_API_KEY = "SG.test-key";
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

    const result = await emailProvider.send(marketingMessage);
    assert.equal(result.providerMessageId, "sg-test-id");
    assert.equal(captured?.url, "https://api.sendgrid.com/v3/mail/send");
    assert.equal(captured?.authorization, "Bearer SG.test-key");
    const payload = JSON.parse(captured?.body ?? "{}") as {
      subject: string;
      content: Array<{ type: string; value: string }>;
      headers: Record<string, string>;
    };
    assert.equal(payload.subject, marketingMessage.subject);
    assert.equal(payload.content.length, 2);
    assert.equal(payload.content[0].type, "text/plain");
    assert.match(payload.content[0].value, /إلغاء الاشتراك: /);
    assert.match(payload.content[0].value, /token=/);
    assert.equal(payload.content[1].type, "text/html");
    assert.match(payload.content[1].value, /dir="rtl"/);
    assert.match(payload.content[1].value, /إلغاء الاشتراك/);
    assert.equal(payload.headers["List-Unsubscribe"], `<${unsubscribeUrl}>`);
    assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  it("sends support mail without unsubscribe parts", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.EMAIL_API_KEY = "SG.test-key";
    resetEnvCache();

    let body = "";
    globalThis.fetch = async (_input, init) => {
      body = String(init?.body);
      return new Response(null, { status: 202, headers: { "x-message-id": "sg-support" } });
    };

    await emailProvider.send(supportMessage);
    const payload = JSON.parse(body) as {
      content: Array<{ type: string; value: string }>;
      headers?: Record<string, string>;
    };
    assert.equal(payload.content.length, 1);
    assert.equal(payload.content[0].type, "text/plain");
    assert.doesNotMatch(payload.content[0].value, /إلغاء الاشتراك/);
    assert.equal(payload.headers, undefined);
  });

  it("turns a SendGrid rejection into an email provider error", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.EMAIL_API_KEY = "SG.test-key";
    resetEnvCache();
    globalThis.fetch = async () => new Response("nope", { status: 403 });

    await assert.rejects(
      () => emailProvider.send(marketingMessage),
      (err: unknown) => err instanceof HttpError && err.statusCode === 502 && err.code === "EMAIL_PROVIDER_ERROR",
    );
  });

  it("sends through an injected SMTP mailer with html and list unsubscribe", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailbox@example.com";
    process.env.SMTP_PASSWORD = "test-smtp-password";
    resetEnvCache();

    let mail: {
      text: string;
      html?: string;
      headers?: Record<string, string>;
      list?: { unsubscribe?: Array<{ url: string }> };
    } | null = null;
    setSmtpMailerFactoryForTests(() => ({
      async sendMail(payload) {
        mail = payload;
        return { messageId: "smtp-test-id" };
      },
    }));

    const sent = await emailProvider.send(marketingMessage);
    assert.equal(sent.providerMessageId, "smtp-test-id");
    assert.match(mail?.text ?? "", /إلغاء الاشتراك: /);
    assert.match(mail?.html ?? "", /dir="rtl"/);
    assert.equal(mail?.headers?.["List-Unsubscribe"], `<${unsubscribeUrl}>`);
    assert.equal(mail?.list?.unsubscribe?.[0]?.url, unsubscribeUrl);

    setSmtpMailerFactoryForTests(() => ({
      async sendMail() {
        throw new Error("535 authentication failed for mailbox@example.com");
      },
    }));
    await assert.rejects(
      () => emailProvider.send(marketingMessage),
      (err: unknown) =>
        err instanceof HttpError &&
        err.code === "EMAIL_PROVIDER_ERROR" &&
        !err.message.includes("535") &&
        !err.message.includes("mailbox@example.com"),
    );
  });

  it("sends SMTP support mail without unsubscribe metadata", async () => {
    applyBaseEnv();
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailbox@example.com";
    process.env.SMTP_PASSWORD = "test-smtp-password";
    resetEnvCache();

    let mail: { text: string; html?: string; headers?: Record<string, string> } | null = null;
    setSmtpMailerFactoryForTests(() => ({
      async sendMail(payload) {
        mail = payload;
        return { messageId: "smtp-support" };
      },
    }));

    await emailProvider.send(supportMessage);
    assert.equal(mail?.text, supportMessage.body);
    assert.equal(mail?.html, undefined);
    assert.equal(mail?.headers, undefined);
  });
});
