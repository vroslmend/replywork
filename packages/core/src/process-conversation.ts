import type { ConversationEvent } from "@replywork/contracts";

import type { ConversationProvider, ConversationResponder, ResponseDecision } from "./ports.js";

export interface ProcessingDependencies {
  conversationProvider: ConversationProvider;
  responder: ConversationResponder;
}

export const processConversation = async (
  event: ConversationEvent,
  dependencies: ProcessingDependencies,
): Promise<ResponseDecision["kind"]> => {
  const decision = await dependencies.responder.decide(event);

  if (decision.kind === "reply") {
    await dependencies.conversationProvider.sendReply({
      conversationId: event.conversationId,
      idempotencyKey: `${event.deliveryKey}:reply`,
      text: decision.text,
    });
    return "reply";
  }

  await dependencies.conversationProvider.requestHandoff({
    context: decision.context,
    conversationId: event.conversationId,
    idempotencyKey: `${event.deliveryKey}:handoff`,
    reason: decision.reason,
  });

  return "handoff";
};
