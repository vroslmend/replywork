import { describe, expect, it } from "vitest";

import { normalizeCrispWebhook } from "@replywork/adapters";

const message = {
  data: {
    content: "  Is the canvas tote available?  ",
    fingerprint: 1_789_297_200_123,
    from: "user",
    origin: "chat",
    session_id: "session_1234-abcd",
    timestamp: 1_789_297_200_000,
    type: "text",
    user: { nickname: "Customer", user_id: "user_42" },
    website_id: "website_123",
  },
  event: "message:send",
  timestamp: 1_789_297_200_000,
  website_id: "website_123",
};

const bodyFor = (overrides: Readonly<Record<string, unknown>> = {}): Buffer =>
  Buffer.from(JSON.stringify({ ...message, ...overrides }));

describe("normalizeCrispWebhook", () => {
  it("normalizes a customer text message", () => {
    expect(normalizeCrispWebhook(bodyFor())).toEqual({
      status: "accepted",
      event: {
        accountId: "website_123",
        conversationId: "session_1234-abcd",
        deliveryKey: "crisp:message:website_123:session_1234-abcd:1789297200123",
        inboxId: "website_123",
        message: {
          contentType: "text",
          id: "1789297200123",
          text: "Is the canvas tote available?",
        },
        occurredAt: "2026-09-13T11:00:00.000Z",
        provider: "crisp",
        sender: { id: "user_42" },
      },
    });
  });

  it.each([
    [{ data: { ...message.data, from: "operator" } }, "non-customer-sender"],
    [{ data: { ...message.data, type: "file" } }, "non-text-message"],
    [{ data: { ...message.data, content: "  " } }, "empty-content"],
    [{ event: "session:update" }, "unsupported-event"],
  ])("ignores messages outside the supported boundary", (overrides, reason) => {
    expect(normalizeCrispWebhook(bodyFor(overrides))).toEqual({ status: "ignored", reason });
  });

  it("rejects invalid JSON and mismatched website IDs", () => {
    expect(normalizeCrispWebhook(Buffer.from("{"))).toEqual({
      status: "invalid",
      issues: ["payload: invalid JSON"],
    });
    expect(
      normalizeCrispWebhook(bodyFor({ data: { ...message.data, website_id: "other" } })),
    ).toEqual({
      status: "invalid",
      issues: ["data.website_id: does not match website_id"],
    });
  });
});
