import type { ConversationEvent } from "@replywork/contracts";
import {
  processConversation,
  type ConversationProvider,
  type ConversationResponder,
} from "@replywork/core";

export interface WorkerDependencies {
  conversationProvider: ConversationProvider;
  responder: ConversationResponder;
}

export const handleQueuedConversation = async (
  event: ConversationEvent,
  dependencies: WorkerDependencies,
): Promise<void> => processConversation(event, dependencies);
