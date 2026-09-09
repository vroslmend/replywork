import type { ConversationEvent } from "@replywork/contracts";

import type { DeliveryQueue, EnqueueResult } from "./ports.js";

export const acceptDelivery = async (
  queue: DeliveryQueue,
  event: ConversationEvent,
): Promise<EnqueueResult> => queue.enqueueOnce(event);
