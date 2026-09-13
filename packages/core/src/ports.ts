import type {
  CatalogItem,
  CatalogQuery,
  ConversationEvent,
  DraftOrder,
  DraftOrderInput,
  OrderStatus,
} from "@replywork/contracts";

export type EnqueueResult = "duplicate" | "queued";

export interface DeliveryQueue {
  enqueueOnce(event: ConversationEvent): Promise<EnqueueResult>;
}

export interface QueuedDelivery {
  event: ConversationEvent;
  messageId: string;
  readCount: number;
}

export interface DeliveryQueueConsumer {
  archive(messageId: string): Promise<void>;
  readOne(visibilityTimeoutSeconds: number): Promise<QueuedDelivery | null>;
}

export interface CatalogCapability {
  searchCatalog(query: CatalogQuery): Promise<readonly CatalogItem[]>;
}

export interface OrderCapability {
  createDraftOrder(input: DraftOrderInput): Promise<DraftOrder>;
  getOrderStatus(orderId: string, verifiedCustomerId: string): Promise<OrderStatus | null>;
}

export interface AuditEntry {
  at: string;
  deliveryKey: string;
  details: Readonly<Record<string, unknown>>;
  kind: "delivery" | "handoff" | "reply" | "tool";
  outcome: "failed" | "ignored" | "succeeded";
}

export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
}

export interface SendReplyInput {
  conversationId: string;
  idempotencyKey: string;
  text: string;
}

export interface RequestHandoffInput {
  context: Readonly<Record<string, unknown>>;
  conversationId: string;
  idempotencyKey: string;
  reason: string;
}

export interface ConversationProvider {
  requestHandoff(input: RequestHandoffInput): Promise<void>;
  sendReply(input: SendReplyInput): Promise<void>;
}

export type ResponseDecision =
  | { kind: "handoff"; context: Readonly<Record<string, unknown>>; reason: string }
  | { kind: "reply"; text: string };

export interface ConversationResponder {
  decide(event: ConversationEvent): Promise<ResponseDecision>;
}

export interface ConversationScope {
  provider: ConversationEvent["provider"];
  accountId: string;
  conversationId: string;
}

export interface HandoffIntent {
  deliveryKey: string;
  context: Readonly<Record<string, unknown>>;
  reason: string;
}

export interface ConversationAutomationState {
  paused: boolean;
  discard: boolean;
  handoff: HandoffIntent | null;
}

export interface ConversationAutomation {
  inspect(event: ConversationEvent): Promise<ConversationAutomationState>;
  pauseForHandoff(
    event: ConversationEvent,
    decision: Extract<ResponseDecision, { kind: "handoff" }>,
  ): Promise<boolean>;
}
