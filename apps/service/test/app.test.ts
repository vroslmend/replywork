import { describe, expect, it } from "vitest";

import { signChatwootPayload, signCrispPayload } from "@replywork/adapters";
import { MemoryDeliveryQueue } from "@replywork/testkit";

import { createServiceApp } from "../src/app.js";

const now = new Date("2026-09-09T10:00:00.000Z");
const timestamp = "1788948000";
const secret = "test-webhook-secret";

const payload = JSON.stringify({
  account: { id: 1 },
  content: "Where is order 42?",
  content_type: "text",
  conversation: { id: 10, inbox_id: 2 },
  created_at: 1_788_948_000,
  event: "message_created",
  id: 20,
  message_type: "incoming",
  private: false,
  sender: { id: 30, type: "contact" },
});

describe("Chatwoot webhook route", () => {
  it("verifies and admits the original request body", async () => {
    const deliveryQueue = new MemoryDeliveryQueue();
    const app = createServiceApp({
      deliveryQueue,
      now: () => now,
      webhook: { provider: "chatwoot", secret },
    });
    const rawBody = Buffer.from(payload);

    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-chatwoot-delivery": "delivery-1",
        "x-chatwoot-signature": signChatwootPayload(rawBody, timestamp, secret),
        "x-chatwoot-timestamp": timestamp,
      },
      method: "POST",
      payload,
      url: "/webhooks/chatwoot",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "queued" });
    expect(deliveryQueue.events).toHaveLength(1);

    await app.close();
  });

  it("rejects a signature made for different bytes", async () => {
    const deliveryQueue = new MemoryDeliveryQueue();
    const app = createServiceApp({
      deliveryQueue,
      now: () => now,
      webhook: { provider: "chatwoot", secret },
    });
    const signedBody = Buffer.from(payload);

    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-chatwoot-signature": signChatwootPayload(signedBody, timestamp, secret),
        "x-chatwoot-timestamp": timestamp,
      },
      method: "POST",
      payload: payload.replace("order 42", "order 43"),
      url: "/webhooks/chatwoot",
    });

    expect(response.statusCode).toBe(401);
    expect(deliveryQueue.events).toHaveLength(0);

    await app.close();
  });

  it("does not admit the same delivery twice", async () => {
    const deliveryQueue = new MemoryDeliveryQueue();
    const app = createServiceApp({
      deliveryQueue,
      now: () => now,
      webhook: { provider: "chatwoot", secret },
    });
    const rawBody = Buffer.from(payload);
    const request = {
      headers: {
        "content-type": "application/json",
        "x-chatwoot-delivery": "delivery-1",
        "x-chatwoot-signature": signChatwootPayload(rawBody, timestamp, secret),
        "x-chatwoot-timestamp": timestamp,
      },
      method: "POST" as const,
      payload,
      url: "/webhooks/chatwoot",
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.json()).toEqual({ status: "queued" });
    expect(second.json()).toEqual({ status: "duplicate" });
    expect(deliveryQueue.events).toHaveLength(1);

    await app.close();
  });
});

describe("Crisp webhook route", () => {
  const crispTimestamp = "1788948000000";
  const crispPayload = JSON.stringify({
    data: {
      content: "Is the tote available?",
      fingerprint: 1_788_948_000_042,
      from: "user",
      origin: "chat",
      session_id: "session_42",
      timestamp: 1_788_948_000_000,
      type: "text",
      user: { user_id: "user_7" },
      website_id: "website_1",
    },
    event: "message:send",
    website_id: "website_1",
  });

  it("verifies and admits a Crisp message exactly once", async () => {
    const deliveryQueue = new MemoryDeliveryQueue();
    const app = createServiceApp({
      deliveryQueue,
      now: () => now,
      webhook: { provider: "crisp", secret },
    });
    const rawBody = Buffer.from(crispPayload);
    const request = {
      headers: {
        "content-type": "application/json",
        "x-crisp-request-timestamp": crispTimestamp,
        "x-crisp-signature": signCrispPayload(rawBody, crispTimestamp, secret),
      },
      method: "POST" as const,
      payload: crispPayload,
      url: "/webhooks/crisp",
    };

    expect((await app.inject(request)).json()).toEqual({ status: "queued" });
    expect((await app.inject(request)).json()).toEqual({ status: "duplicate" });
    expect(deliveryQueue.events).toHaveLength(1);
    expect(deliveryQueue.events[0]).toMatchObject({ provider: "crisp" });
    await app.close();
  });

  it("rejects an invalid Crisp signature", async () => {
    const deliveryQueue = new MemoryDeliveryQueue();
    const app = createServiceApp({
      deliveryQueue,
      now: () => now,
      webhook: { provider: "crisp", secret },
    });
    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-crisp-request-timestamp": crispTimestamp,
        "x-crisp-signature": "0".repeat(64),
      },
      method: "POST",
      payload: crispPayload,
      url: "/webhooks/crisp",
    });
    expect(response.statusCode).toBe(401);
    expect(deliveryQueue.events).toHaveLength(0);
    await app.close();
  });
});
