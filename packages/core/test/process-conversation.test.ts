import { describe, expect, it } from "vitest";

import type { ConversationEvent } from "@replywork/contracts";
import { processConversation } from "@replywork/core";
import { FakeConversationProvider } from "@replywork/testkit";

const event: ConversationEvent = {
  accountId: "1",
  conversationId: "10",
  deliveryKey: "chatwoot:delivery:delivery-1",
  inboxId: "2",
  message: { contentType: "text", id: "20", text: "Hello" },
  occurredAt: "2026-09-09T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "30" },
};

describe("processConversation", () => {
  it("sends a reply with an action-specific idempotency key", async () => {
    const conversationProvider = new FakeConversationProvider();

    await expect(
      processConversation(event, {
        conversationProvider,
        responder: { decide: async () => ({ kind: "reply", text: "Hello." }) },
      }),
    ).resolves.toBe("reply");

    expect(conversationProvider.replies).toEqual([
      {
        conversationId: "10",
        idempotencyKey: "chatwoot:delivery:delivery-1:reply",
        text: "Hello.",
      },
    ]);
  });

  it("requests a handoff without sending a reply", async () => {
    const conversationProvider = new FakeConversationProvider();

    await expect(
      processConversation(event, {
        conversationProvider,
        responder: {
          decide: async () => ({
            context: { orderId: "order-1" },
            kind: "handoff",
            reason: "operator approval required",
          }),
        },
      }),
    ).resolves.toBe("handoff");

    expect(conversationProvider.replies).toHaveLength(0);
    expect(conversationProvider.handoffs).toEqual([
      {
        context: { orderId: "order-1" },
        conversationId: "10",
        idempotencyKey: "chatwoot:delivery:delivery-1:handoff",
        reason: "operator approval required",
      },
    ]);
  });
});
