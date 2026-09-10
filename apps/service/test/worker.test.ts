import { describe, expect, it } from "vitest";

import type { ConversationEvent } from "@replywork/contracts";
import type {
  AuditEntry,
  AuditStore,
  DeliveryQueueConsumer,
  QueuedDelivery,
} from "@replywork/core";
import { FakeConversationProvider } from "@replywork/testkit";

import { runWorkerOnce } from "../src/worker.js";

const event: ConversationEvent = {
  accountId: "1",
  conversationId: "10",
  deliveryKey: "chatwoot:delivery:worker-test",
  inboxId: "2",
  message: { contentType: "text", id: "20", text: "Hello" },
  occurredAt: "2026-09-09T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "30" },
};

class MemoryAuditStore implements AuditStore {
  readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class FakeDeliveryQueueConsumer implements DeliveryQueueConsumer {
  readonly archived: string[] = [];
  visibilityTimeoutSeconds: number | undefined;

  constructor(private readonly delivery: QueuedDelivery | null) {}

  async archive(messageId: string): Promise<void> {
    this.archived.push(messageId);
  }

  async readOne(visibilityTimeoutSeconds: number): Promise<QueuedDelivery | null> {
    this.visibilityTimeoutSeconds = visibilityTimeoutSeconds;
    return this.delivery;
  }
}

const queuedDelivery: QueuedDelivery = {
  event,
  messageId: "41",
  readCount: 1,
};

describe("runWorkerOnce", () => {
  it("returns idle when no delivery is available", async () => {
    const auditStore = new MemoryAuditStore();
    const deliveryQueue = new FakeDeliveryQueueConsumer(null);

    await expect(
      runWorkerOnce({
        auditStore,
        conversationProvider: new FakeConversationProvider(),
        deliveryQueue,
        responder: { decide: async () => ({ kind: "reply", text: "Hello." }) },
      }),
    ).resolves.toBe("idle");

    expect(auditStore.entries).toHaveLength(0);
    expect(deliveryQueue.archived).toHaveLength(0);
  });

  it("records and archives a successful delivery", async () => {
    const auditStore = new MemoryAuditStore();
    const conversationProvider = new FakeConversationProvider();
    const deliveryQueue = new FakeDeliveryQueueConsumer(queuedDelivery);

    await expect(
      runWorkerOnce(
        {
          auditStore,
          conversationProvider,
          deliveryQueue,
          responder: { decide: async () => ({ kind: "reply", text: "Hello." }) },
        },
        { now: () => new Date("2026-09-10T10:00:00.000Z"), visibilityTimeoutSeconds: 45 },
      ),
    ).resolves.toBe("processed");

    expect(deliveryQueue.visibilityTimeoutSeconds).toBe(45);
    expect(deliveryQueue.archived).toEqual(["41"]);
    expect(conversationProvider.replies).toHaveLength(1);
    expect(auditStore.entries).toEqual([
      {
        at: "2026-09-10T10:00:00.000Z",
        deliveryKey: event.deliveryKey,
        details: { attempt: 1 },
        kind: "reply",
        outcome: "succeeded",
      },
    ]);
  });

  it("records a failed attempt without archiving it", async () => {
    const auditStore = new MemoryAuditStore();
    const deliveryQueue = new FakeDeliveryQueueConsumer(queuedDelivery);
    const failure = new Error("provider unavailable");

    await expect(
      runWorkerOnce(
        {
          auditStore,
          conversationProvider: new FakeConversationProvider(),
          deliveryQueue,
          responder: { decide: async () => Promise.reject(failure) },
        },
        { now: () => new Date("2026-09-10T10:00:00.000Z") },
      ),
    ).rejects.toBe(failure);

    expect(deliveryQueue.archived).toHaveLength(0);
    expect(auditStore.entries).toEqual([
      {
        at: "2026-09-10T10:00:00.000Z",
        deliveryKey: event.deliveryKey,
        details: { attempt: 1, stage: "processing" },
        kind: "delivery",
        outcome: "failed",
      },
    ]);
  });
});
