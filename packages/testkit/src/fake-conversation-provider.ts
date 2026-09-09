import type { ConversationProvider, RequestHandoffInput, SendReplyInput } from "@replywork/core";

export class FakeConversationProvider implements ConversationProvider {
  readonly handoffs: RequestHandoffInput[] = [];
  readonly replies: SendReplyInput[] = [];

  async requestHandoff(input: RequestHandoffInput): Promise<void> {
    this.handoffs.push(input);
  }

  async sendReply(input: SendReplyInput): Promise<void> {
    this.replies.push(input);
  }
}
