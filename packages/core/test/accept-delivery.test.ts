import { describe, expect, it } from "vitest";

import type { ConversationEvent } from "@replywork/contracts";
import { acceptDelivery } from "@replywork/core";
import { MemoryDeliveryQueue } from "@replywork/testkit";

const event: ConversationEvent = {
  accountId: "1",
  conversationId: "10",
  deliveryKey: "chatwoot:delivery:delivery-1",
  inboxId: "2",
  message: {
    contentType: "text",
    id: "20",
    text: "Where is my order?",
  },
  occurredAt: "2026-09-09T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "30" },
};

describe("acceptDelivery", () => {
  it("admits a delivery only once", async () => {
    const queue = new MemoryDeliveryQueue();

    await expect(acceptDelivery(queue, event)).resolves.toBe("queued");
    await expect(acceptDelivery(queue, event)).resolves.toBe("duplicate");
    expect(queue.events).toEqual([event]);
  });
});
