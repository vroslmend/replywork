import type { ConversationEvent } from "@replywork/contracts";
import type { DeliveryQueue, EnqueueResult } from "@replywork/core";

export class MemoryDeliveryQueue implements DeliveryQueue {
  readonly #events = new Map<string, ConversationEvent>();

  get events(): readonly ConversationEvent[] {
    return [...this.#events.values()];
  }

  async enqueueOnce(event: ConversationEvent): Promise<EnqueueResult> {
    if (this.#events.has(event.deliveryKey)) {
      return "duplicate";
    }

    this.#events.set(event.deliveryKey, event);
    return "queued";
  }
}
