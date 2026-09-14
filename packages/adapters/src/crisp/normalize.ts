import { conversationEventSchema, type ConversationEvent } from "@replywork/contracts";
import { z } from "zod";

const externalIdSchema = z.union([z.string().min(1), z.number()]).transform(String);
const webhookBaseSchema = z.object({ event: z.string().min(1) }).loose();
const messageSendSchema = z
  .object({
    data: z
      .object({
        content: z.string().nullable(),
        fingerprint: externalIdSchema,
        from: z.string().min(1),
        origin: z.string().optional(),
        session_id: z.string().min(1),
        timestamp: z.union([z.string().min(1), z.number()]),
        type: z.string().min(1),
        user: z.object({ user_id: externalIdSchema }).loose(),
        website_id: z.string().min(1).optional(),
      })
      .loose(),
    event: z.literal("message:send"),
    website_id: z.string().min(1),
  })
  .loose();

export type CrispIgnoreReason =
  "empty-content" | "non-customer-sender" | "non-text-message" | "unsupported-event";

export type CrispNormalization =
  | { status: "accepted"; event: ConversationEvent }
  | { status: "ignored"; reason: CrispIgnoreReason }
  | { status: "invalid"; issues: readonly string[] };

const issueMessages = (error: z.ZodError): readonly string[] =>
  error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`);

const toIsoTimestamp = (value: number | string): string | null => {
  if (typeof value === "number" || /^\d+$/.test(value)) {
    const numericValue = Number(value);
    const milliseconds = numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeCrispWebhook = (rawBody: Buffer): CrispNormalization => {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: "invalid", issues: ["payload: invalid JSON"] };
  }

  const baseResult = webhookBaseSchema.safeParse(payload);
  if (!baseResult.success) return { status: "invalid", issues: issueMessages(baseResult.error) };
  if (baseResult.data.event !== "message:send") {
    return { status: "ignored", reason: "unsupported-event" };
  }

  const result = messageSendSchema.safeParse(payload);
  if (!result.success) return { status: "invalid", issues: issueMessages(result.error) };
  const message = result.data.data;
  if (message.from.toLowerCase() !== "user") {
    return { status: "ignored", reason: "non-customer-sender" };
  }
  if (message.type.toLowerCase() !== "text") {
    return { status: "ignored", reason: "non-text-message" };
  }
  const text = message.content?.trim();
  if (text === undefined || text.length === 0) {
    return { status: "ignored", reason: "empty-content" };
  }
  const occurredAt = toIsoTimestamp(message.timestamp);
  if (occurredAt === null)
    return { status: "invalid", issues: ["data.timestamp: invalid timestamp"] };

  const websiteId = result.data.website_id;
  if (message.website_id !== undefined && message.website_id !== websiteId) {
    return { status: "invalid", issues: ["data.website_id: does not match website_id"] };
  }
  const eventResult = conversationEventSchema.safeParse({
    accountId: websiteId,
    conversationId: message.session_id,
    deliveryKey: `crisp:message:${websiteId}:${message.session_id}:${message.fingerprint}`,
    inboxId: websiteId,
    message: { contentType: message.type, id: message.fingerprint, text },
    occurredAt,
    provider: "crisp",
    sender: { id: message.user.user_id },
  });
  return eventResult.success
    ? { status: "accepted", event: eventResult.data }
    : { status: "invalid", issues: issueMessages(eventResult.error) };
};
