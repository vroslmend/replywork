import type { ConversationEvent } from "@replywork/contracts";
import {
  processConversation,
  type AuditStore,
  type ConversationAutomation,
  type ConversationProvider,
  type ConversationResponder,
  type DeliveryQueueConsumer,
  type ProcessingResult,
} from "@replywork/core";

export interface WorkerDependencies {
  accountId: string;
  conversationAutomation: ConversationAutomation;
  conversationProvider: ConversationProvider;
  responder: ConversationResponder;
}

export const handleQueuedConversation = async (
  event: ConversationEvent,
  dependencies: WorkerDependencies,
): Promise<ProcessingResult> => {
  if (event.accountId !== dependencies.accountId) {
    throw new Error("Delivery account does not match the configured worker account");
  }
  return processConversation(event, dependencies);
};

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

  let kind: ProcessingResult;
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
    details: {
      attempt: delivery.readCount,
      ...(kind === "ignored" ? { reason: "conversation-control" } : {}),
    },
    kind: kind === "ignored" ? "delivery" : kind,
    outcome: kind === "ignored" ? "ignored" : "succeeded",
  });
  await dependencies.deliveryQueue.archive(delivery.messageId);

  return "processed";
};
