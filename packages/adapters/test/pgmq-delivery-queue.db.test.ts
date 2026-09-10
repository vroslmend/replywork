import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, PgmqDeliveryQueue } from "@replywork/adapters";
import type { ConversationEvent } from "@replywork/contracts";

const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const databaseUrl = process.env.REPLYWORK_TEST_DATABASE_URL ?? defaultDatabaseUrl;
const databaseHost = new URL(databaseUrl).hostname;

if (!["127.0.0.1", "::1", "localhost"].includes(databaseHost)) {
  throw new Error("Database tests require a local PostgreSQL connection");
}

const testRun = `${process.pid}_${Date.now()}`;
const deliveryPrefix = `chatwoot:delivery:database-test-${testRun}`;
const queueName = `conversation_events_test_${testRun}`;

const eventFor = (suffix: string, messageId = `message-${suffix}`): ConversationEvent => ({
  accountId: "account-test",
  conversationId: "conversation-test",
  deliveryKey: `${deliveryPrefix}-${suffix}`,
  inboxId: "inbox-test",
  message: {
    contentType: "text",
    id: messageId,
    text: "Synthetic database test message.",
  },
  occurredAt: "2026-09-09T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "sender-test" },
});

const database = createDatabase(databaseUrl);
const queue = new PgmqDeliveryQueue(database.sql, { queueName });

beforeAll(async () => {
  await database.sql`SELECT pgmq.create(${queueName})`;
});

afterAll(async () => {
  await database.sql`
    DELETE FROM replywork.audit_entries
    WHERE delivery_key LIKE ${`${deliveryPrefix}%`}
  `;
  await database.sql`
    DELETE FROM replywork.delivery_receipts
    WHERE delivery_key LIKE ${`${deliveryPrefix}%`}
  `;
  await database.sql`SELECT pgmq.drop_queue(${queueName})`;
  await database.close();
});

describe("PgmqDeliveryQueue", () => {
  it("stores and queues a delivery only once", async () => {
    const event = eventFor("once");

    await expect(queue.enqueueOnce(event)).resolves.toBe("queued");
    await expect(queue.enqueueOnce(event)).resolves.toBe("duplicate");

    const [counts] = await database.sql<
      { auditEntries: number; queuedMessages: number; receipts: number }[]
    >`
      SELECT
        (
          SELECT count(*)::integer
          FROM replywork.audit_entries
          WHERE delivery_key = ${event.deliveryKey}
        ) AS "auditEntries",
        (
          SELECT count(*)::integer
          FROM ${database.sql(`pgmq.q_${queueName}`)}
          WHERE message ->> 'deliveryKey' = ${event.deliveryKey}
        ) AS "queuedMessages",
        (
          SELECT count(*)::integer
          FROM replywork.delivery_receipts
          WHERE delivery_key = ${event.deliveryKey}
        ) AS receipts
    `;

    expect(counts).toEqual({ auditEntries: 1, queuedMessages: 1, receipts: 1 });
  });

  it("deduplicates a provider message received under a different delivery key", async () => {
    const first = eventFor("provider-message-a", "shared-message");
    const second = eventFor("provider-message-b", "shared-message");

    await expect(queue.enqueueOnce(first)).resolves.toBe("queued");
    await expect(queue.enqueueOnce(second)).resolves.toBe("duplicate");

    const [receipt] = await database.sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM replywork.delivery_receipts
      WHERE delivery_key IN (${first.deliveryKey}, ${second.deliveryKey})
    `;

    expect(receipt?.count).toBe(1);
  });

  it("rolls back the receipt when queueing fails", async () => {
    const event = eventFor("rollback");
    const missingQueue = new PgmqDeliveryQueue(database.sql, {
      queueName: `${queueName}_missing`,
    });

    await expect(missingQueue.enqueueOnce(event)).rejects.toThrow();

    const [receipt] = await database.sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM replywork.delivery_receipts
      WHERE delivery_key = ${event.deliveryKey}
    `;

    expect(receipt?.count).toBe(0);
  });
});
