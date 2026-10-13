import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { resetEnvCache } from "../src/config/env.js";

let server: Server;
let baseUrl = "";

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.GROK_AGENT_API_KEY = "test-grok-agent-key-32chars!";
  process.env.STORE_API_KEY = "test-store-api-key-32chars!!";
  process.env.EMAIL_FROM = "test@example.com";
  process.env.EMAIL_REPLY_TO = "test@example.com";
  process.env.EMAIL_PROVIDER = "console";
  resetEnvCache();

  const { createApp } = await import("../src/app.js");
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("store checkout routes", () => {
  it("rejects missing store credentials", async () => {
    const created = await fetch(`${baseUrl}/api/checkouts`, { method: "POST" });
    assert.equal(created.status, 401);
    const createdBody = (await created.json()) as { code: string };
    assert.equal(createdBody.code, "STORE_AUTH_REQUIRED");

    const sweep = await fetch(`${baseUrl}/api/checkouts/abandon-stale`, { method: "POST" });
    assert.equal(sweep.status, 401);

    const agent = await fetch(`${baseUrl}/api/agent/checkouts/abandoned`);
    assert.equal(agent.status, 401);
    const agentBody = (await agent.json()) as { code: string };
    assert.equal(agentBody.code, "AGENT_AUTH_REQUIRED");
  });

  it("validates the checkout payload before touching storage", async () => {
    const response = await fetch(`${baseUrl}/api/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STORE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "baylaamine@gmail.com",
        externalCheckoutId: "order-1",
        cartData: { items: [] },
        totalAmount: 149,
        currency: "AEDX",
        marketingConsent: true,
      }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, "VALIDATION_ERROR");
  });
});
