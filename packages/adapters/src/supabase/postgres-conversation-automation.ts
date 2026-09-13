import type { ConversationEvent } from "@replywork/contracts";
import type {
  ConversationAutomation,
  ConversationAutomationState,
  ConversationScope,
  ResponseDecision,
} from "@replywork/core";
import type postgres from "postgres";
import { z } from "zod";

const scopeSchema = z.object({
  provider: z.literal("chatwoot"),
  accountId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1),
});
const handoffSchema = z.object({
  deliveryKey: z.string().min(1),
  context: z.record(z.string(), z.json()),
  reason: z.string().min(1),
});
const stateSchema = z.object({
  paused: z.boolean(),
  discard: z.boolean(),
  handoff: handoffSchema.nullable(),
});

export interface ConversationAutomationStatus {
  paused: boolean;
  resumedAt: string | null;
  changedAt: string | null;
}

export class PostgresConversationAutomation implements ConversationAutomation {
  constructor(private readonly sql: postgres.Sql) {}

  async inspect(event: ConversationEvent): Promise<ConversationAutomationState> {
    const scope = scopeSchema.parse(event);
    const [row] = await this.sql`
      SELECT coalesce(c.paused, false) AS paused,
        coalesce(r.received_at <= c.resumed_at, false) AS discard, c.handoff
      FROM replywork.delivery_receipts r
      LEFT JOIN replywork.conversation_automation c
        USING (provider, account_id, conversation_id)
      WHERE r.delivery_key = ${event.deliveryKey} AND r.provider = ${scope.provider}
        AND r.account_id = ${scope.accountId} AND r.conversation_id = ${scope.conversationId}
    `;
    if (row === undefined) throw new Error("Conversation control requires an admitted delivery");
    return stateSchema.parse(row);
  }

  async pauseForHandoff(
    event: ConversationEvent,
    decision: Extract<ResponseDecision, { kind: "handoff" }>,
  ): Promise<boolean> {
    const scope = scopeSchema.parse(event);
    const handoff = handoffSchema.parse({ ...decision, deliveryKey: event.deliveryKey });
    const rows = await this.sql`
      INSERT INTO replywork.conversation_automation AS c
        (provider, account_id, conversation_id, paused, handoff)
      SELECT r.provider, r.account_id, r.conversation_id, true, ${JSON.stringify(handoff)}::jsonb
      FROM replywork.delivery_receipts r
      WHERE r.delivery_key = ${event.deliveryKey} AND r.provider = ${scope.provider}
        AND r.account_id = ${scope.accountId} AND r.conversation_id = ${scope.conversationId}
      ON CONFLICT (provider, account_id, conversation_id) DO UPDATE
        SET paused = true, handoff = EXCLUDED.handoff, changed_at = now()
      WHERE c.paused = false AND (
        c.resumed_at IS NULL OR c.resumed_at < (
          SELECT received_at FROM replywork.delivery_receipts WHERE delivery_key = ${event.deliveryKey}
        )
      )
      RETURNING provider
    `;
    return rows.length === 1;
  }

  async getStatus(input: ConversationScope): Promise<ConversationAutomationStatus> {
    const scope = scopeSchema.parse(input);
    const [row] = await this.sql<ConversationAutomationStatus[]>`
      SELECT paused, resumed_at::text AS "resumedAt", changed_at::text AS "changedAt"
      FROM replywork.conversation_automation
      WHERE provider = ${scope.provider} AND account_id = ${scope.accountId}
        AND conversation_id = ${scope.conversationId}
    `;
    return row ?? { paused: false, resumedAt: null, changedAt: null };
  }

  async setPaused(input: ConversationScope, paused: boolean): Promise<void> {
    const scope = scopeSchema.parse(input);
    await this.sql`
      INSERT INTO replywork.conversation_automation AS c
        (provider, account_id, conversation_id, paused, resumed_at)
      VALUES (${scope.provider}, ${scope.accountId}, ${scope.conversationId}, ${paused},
        CASE WHEN ${paused} THEN NULL ELSE now() END)
      ON CONFLICT (provider, account_id, conversation_id) DO UPDATE
        SET paused = EXCLUDED.paused,
          handoff = CASE WHEN EXCLUDED.paused THEN c.handoff ELSE NULL END,
          resumed_at = CASE WHEN EXCLUDED.paused THEN c.resumed_at ELSE now() END,
          changed_at = now()
    `;
  }
}
