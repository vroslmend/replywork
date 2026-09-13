import type { ConversationEvent } from "@replywork/contracts";
import type {
  ConversationAutomation,
  ConversationAutomationState,
  ResponseDecision,
} from "@replywork/core";

// Test fixture for pause and handoff processing. Receipt cutoffs are tested against PostgreSQL.
export class MemoryConversationAutomation implements ConversationAutomation {
  readonly states = new Map<string, ConversationAutomationState>();

  private key(event: ConversationEvent): string {
    return JSON.stringify([event.provider, event.accountId, event.conversationId]);
  }

  async inspect(event: ConversationEvent): Promise<ConversationAutomationState> {
    return this.states.get(this.key(event)) ?? { paused: false, discard: false, handoff: null };
  }

  async pauseForHandoff(
    event: ConversationEvent,
    decision: Extract<ResponseDecision, { kind: "handoff" }>,
  ): Promise<boolean> {
    const state = await this.inspect(event);
    if (state.paused || state.discard) return false;
    this.states.set(this.key(event), {
      paused: true,
      discard: false,
      handoff: {
        deliveryKey: event.deliveryKey,
        context: decision.context,
        reason: decision.reason,
      },
    });
    return true;
  }
}
