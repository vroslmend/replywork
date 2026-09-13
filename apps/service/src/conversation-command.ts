export interface ConversationControlCommand {
  action: "pause" | "resume" | "status";
  conversationId: string;
}

export const parseConversationArguments = (
  arguments_: readonly string[],
): ConversationControlCommand => {
  const [action, conversationId] = arguments_;
  if (
    arguments_.length !== 2 ||
    (action !== "pause" && action !== "resume" && action !== "status") ||
    conversationId === undefined ||
    !/^[1-9]\d*$/.test(conversationId)
  ) {
    throw new Error("Usage: pnpm conversation:control <status|pause|resume> <conversation-id>");
  }
  return { action, conversationId };
};
