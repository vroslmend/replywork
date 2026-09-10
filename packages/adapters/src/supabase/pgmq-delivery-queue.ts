import type { ConversationEvent } from "@replywork/contracts";
import type { DeliveryQueue, EnqueueResult } from "@replywork/core";
import type postgres from "postgres";

export interface PgmqDeliveryQueueOptions {
  queueName?: string;
}

export class PgmqDeliveryQueue implements DeliveryQueue {
  readonly #queueName: string;
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql, options: PgmqDeliveryQueueOptions = {}) {
    this.#queueName = options.queueName ?? "conversation_events";
    this.#sql = sql;
  }

  async enqueueOnce(event: ConversationEvent): Promise<EnqueueResult> {
    return this.#sql.begin(async (transaction) => {
      const receipts = await transaction<{ deliveryKey: string }[]>`
        INSERT INTO replywork.delivery_receipts (
          delivery_key,
          provider,
          account_id,
          inbox_id,
          conversation_id,
          message_id,
          occurred_at
        )
        VALUES (
          ${event.deliveryKey},
          ${event.provider},
          ${event.accountId},
          ${event.inboxId},
          ${event.conversationId},
          ${event.message.id},
          ${event.occurredAt}
        )
        ON CONFLICT DO NOTHING
        RETURNING delivery_key AS "deliveryKey"
      `;

      if (receipts.length === 0) {
        return "duplicate";
      }

      await transaction`
        SELECT pgmq.send(
          ${this.#queueName},
          ${JSON.stringify(event)}::jsonb
        )
      `;

      await transaction`
        INSERT INTO replywork.audit_entries (
          delivery_key,
          kind,
          outcome,
          details
        )
        VALUES (
          ${event.deliveryKey},
          'delivery',
          'succeeded',
          ${JSON.stringify({ status: "queued" })}::jsonb
        )
      `;

      return "queued";
    });
  }
}
