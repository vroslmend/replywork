import { describe, expect, it } from "vitest";

import { createChatwootDeliveryKey, normalizeChatwootWebhook } from "@replywork/adapters";

const message = {
  account: { id: 1 },
  content: "  Where is order 42?  ",
  content_type: "text",
  conversation: { id: 10, inbox_id: 2 },
  created_at: 1_788_948_000,
  event: "message_created",
  id: 20,
  message_type: "incoming",
  private: false,
  sender: { id: 30, type: "contact" },
};

const bodyFor = (overrides: Readonly<Record<string, unknown>> = {}): Buffer =>
  Buffer.from(JSON.stringify({ ...message, ...overrides }));

describe("normalizeChatwootWebhook", () => {
  it("normalizes a supported customer message", () => {
    const result = normalizeChatwootWebhook(bodyFor(), "delivery-1");

    expect(result).toEqual({
      status: "accepted",
      event: {
        accountId: "1",
        conversationId: "10",
        deliveryKey: "chatwoot:delivery:delivery-1",
        inboxId: "2",
        message: {
          contentType: "text",
          id: "20",
          text: "Where is order 42?",
        },
        occurredAt: "2026-09-09T10:00:00.000Z",
        provider: "chatwoot",
        sender: { id: "30" },
      },
    });
  });

  it.each([
    [{ private: true }, "private-message"],
    [{ message_type: "outgoing" }, "non-incoming-message"],
    [{ sender: { id: 30, type: "user" } }, "non-customer-sender"],
    [{ content: "   " }, "empty-content"],
    [{ event: "conversation_updated" }, "unsupported-event"],
  ])("ignores messages outside the supported boundary", (overrides, reason) => {
    expect(normalizeChatwootWebhook(bodyFor(overrides), "delivery-1")).toEqual({
      status: "ignored",
      reason,
    });
  });

  it("returns a validation result for malformed JSON", () => {
    expect(normalizeChatwootWebhook(Buffer.from("{"), "delivery-1")).toEqual({
      status: "invalid",
      issues: ["payload: invalid JSON"],
    });
  });

  it("derives the same fallback delivery key from the same bytes", () => {
    const rawBody = bodyFor();

    expect(createChatwootDeliveryKey(rawBody, undefined)).toBe(
      createChatwootDeliveryKey(rawBody, undefined),
    );
    expect(createChatwootDeliveryKey(rawBody, undefined)).toMatch(/^chatwoot:body:[a-f0-9]{64}$/);
  });
});
