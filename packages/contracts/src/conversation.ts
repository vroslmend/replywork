import { z } from "zod";

export const conversationEventSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  deliveryKey: z.string().min(1),
  inboxId: z.string().min(1),
  message: z.object({
    contentType: z.string().min(1),
    id: z.string().min(1),
    text: z.string().min(1),
  }),
  occurredAt: z.iso.datetime(),
  provider: z.literal("chatwoot"),
  sender: z.object({
    id: z.string().min(1),
  }),
});

export type ConversationEvent = z.infer<typeof conversationEventSchema>;
