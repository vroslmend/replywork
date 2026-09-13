import type { ConversationEvent } from "@replywork/contracts";

import type {
  ConversationAutomation,
  ConversationProvider,
  ConversationResponder,
} from "./ports.js";

export interface ProcessingDependencies {
  conversationAutomation: ConversationAutomation;
  conversationProvider: ConversationProvider;
  responder: ConversationResponder;
}

export type ProcessingResult = "reply" | "handoff" | "ignored";

export const processConversation = async (
  event: ConversationEvent,
  dependencies: ProcessingDependencies,
): Promise<ProcessingResult> => {
  const state = await dependencies.conversationAutomation.inspect(event);
  if (state.discard) return "ignored";
  if (state.paused) {
    if (state.handoff?.deliveryKey !== event.deliveryKey) return "ignored";
    await dependencies.conversationProvider.requestHandoff({
      context: state.handoff.context,
      conversationId: event.conversationId,
      idempotencyKey: `${event.deliveryKey}:handoff`,
      reason: state.handoff.reason,
    });
    return "handoff";
  }

  const decision = await dependencies.responder.decide(event);

  if (decision.kind === "reply") {
    const latest = await dependencies.conversationAutomation.inspect(event);
    if (latest.paused || latest.discard) return "ignored";
    await dependencies.conversationProvider.sendReply({
      conversationId: event.conversationId,
      idempotencyKey: `${event.deliveryKey}:reply`,
      text: decision.text,
    });
    return "reply";
  }

  if (!(await dependencies.conversationAutomation.pauseForHandoff(event, decision))) {
    return "ignored";
  }
  await dependencies.conversationProvider.requestHandoff({
    context: decision.context,
    conversationId: event.conversationId,
    idempotencyKey: `${event.deliveryKey}:handoff`,
    reason: decision.reason,
  });

  return "handoff";
};
