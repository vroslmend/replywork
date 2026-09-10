import type { ConversationEvent } from "@replywork/contracts";
import {
  processConversation,
  type AuditStore,
  type ConversationProvider,
  type ConversationResponder,
  type DeliveryQueueConsumer,
  type ResponseDecision,
} from "@replywork/core";

export interface WorkerDependencies {
  conversationProvider: ConversationProvider;
  responder: ConversationResponder;
}

export const handleQueuedConversation = async (
  event: ConversationEvent,
  dependencies: WorkerDependencies,
): Promise<ResponseDecision["kind"]> => processConversation(event, dependencies);

export interface QueueWorkerDependencies extends WorkerDependencies {
  auditStore: AuditStore;
  deliveryQueue: DeliveryQueueConsumer;
}

export interface RunWorkerOnceOptions {
  now?: () => Date;
  visibilityTimeoutSeconds?: number;
}

export type WorkerRunResult = "idle" | "processed";

export const runWorkerOnce = async (
  dependencies: QueueWorkerDependencies,
  options: RunWorkerOnceOptions = {},
): Promise<WorkerRunResult> => {
  const visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? 30;
  if (!Number.isInteger(visibilityTimeoutSeconds) || visibilityTimeoutSeconds <= 0) {
    throw new RangeError("visibility timeout must be a positive integer");
  }

  const delivery = await dependencies.deliveryQueue.readOne(visibilityTimeoutSeconds);
  if (delivery === null) {
    return "idle";
  }

  let kind: ResponseDecision["kind"];
  try {
    kind = await handleQueuedConversation(delivery.event, dependencies);
  } catch (error) {
    await dependencies.auditStore.append({
      at: (options.now?.() ?? new Date()).toISOString(),
      deliveryKey: delivery.event.deliveryKey,
      details: { attempt: delivery.readCount, stage: "processing" },
      kind: "delivery",
      outcome: "failed",
    });
    throw error;
  }

  await dependencies.auditStore.append({
    at: (options.now?.() ?? new Date()).toISOString(),
    deliveryKey: delivery.event.deliveryKey,
    details: { attempt: delivery.readCount },
    kind,
    outcome: "succeeded",
  });
  await dependencies.deliveryQueue.archive(delivery.messageId);

  return "processed";
};
