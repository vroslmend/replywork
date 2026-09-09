import { createHash } from "node:crypto";

import { conversationEventSchema, type ConversationEvent } from "@replywork/contracts";
import { z } from "zod";

const externalIdSchema = z.union([z.string().min(1), z.number().int()]).transform(String);

const webhookBaseSchema = z.object({ event: z.string().min(1) }).loose();

const messageCreatedSchema = z
  .object({
    account: z.object({ id: externalIdSchema }),
    content: z.string().nullable(),
    content_type: z.string().min(1).optional(),
    conversation: z.object({
      id: externalIdSchema,
      inbox_id: externalIdSchema,
    }),
    created_at: z.union([z.string().min(1), z.number()]),
    event: z.literal("message_created"),
    id: externalIdSchema,
    message_type: z.union([z.string().min(1), z.number().int()]),
    private: z.boolean().optional().default(false),
    sender: z.object({
      id: externalIdSchema,
      type: z.string().min(1),
    }),
  })
  .loose();

export type IgnoreReason =
  | "empty-content"
  | "non-customer-sender"
  | "non-incoming-message"
  | "private-message"
  | "unsupported-event";

export type ChatwootNormalization =
  | { status: "accepted"; event: ConversationEvent }
  | { status: "ignored"; reason: IgnoreReason }
  | { status: "invalid"; issues: readonly string[] };

const toIsoTimestamp = (value: number | string): string | null => {
  if (typeof value === "number") {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (/^\d+$/.test(value)) {
    return toIsoTimestamp(Number(value));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const issueMessages = (error: z.ZodError): readonly string[] =>
  error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`);

export const createChatwootDeliveryKey = (
  rawBody: Buffer,
  deliveryId: string | undefined,
): string => {
  const trimmedDeliveryId = deliveryId?.trim();
  if (trimmedDeliveryId !== undefined && trimmedDeliveryId.length > 0) {
    return `chatwoot:delivery:${trimmedDeliveryId}`;
  }

  return `chatwoot:body:${createHash("sha256").update(rawBody).digest("hex")}`;
};

export const normalizeChatwootWebhook = (
  rawBody: Buffer,
  deliveryId: string | undefined,
): ChatwootNormalization => {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: "invalid", issues: ["payload: invalid JSON"] };
  }

  const baseResult = webhookBaseSchema.safeParse(payload);
  if (!baseResult.success) {
    return { status: "invalid", issues: issueMessages(baseResult.error) };
  }

  if (baseResult.data.event !== "message_created") {
    return { status: "ignored", reason: "unsupported-event" };
  }

  const messageResult = messageCreatedSchema.safeParse(payload);
  if (!messageResult.success) {
    return { status: "invalid", issues: issueMessages(messageResult.error) };
  }

  const message = messageResult.data;
  if (message.private) {
    return { status: "ignored", reason: "private-message" };
  }

  if (message.message_type !== "incoming" && message.message_type !== 0) {
    return { status: "ignored", reason: "non-incoming-message" };
  }

  if (message.sender.type.toLowerCase() !== "contact") {
    return { status: "ignored", reason: "non-customer-sender" };
  }

  const text = message.content?.trim();
  if (text === undefined || text.length === 0) {
    return { status: "ignored", reason: "empty-content" };
  }

  const occurredAt = toIsoTimestamp(message.created_at);
  if (occurredAt === null) {
    return { status: "invalid", issues: ["created_at: invalid timestamp"] };
  }

  const eventResult = conversationEventSchema.safeParse({
    accountId: message.account.id,
    conversationId: message.conversation.id,
    deliveryKey: createChatwootDeliveryKey(rawBody, deliveryId),
    inboxId: message.conversation.inbox_id,
    message: {
      contentType: message.content_type ?? "text",
      id: message.id,
      text,
    },
    occurredAt,
    provider: "chatwoot",
    sender: { id: message.sender.id },
  });

  if (!eventResult.success) {
    return { status: "invalid", issues: issueMessages(eventResult.error) };
  }

  return { status: "accepted", event: eventResult.data };
};
