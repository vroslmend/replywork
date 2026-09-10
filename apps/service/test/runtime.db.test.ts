import { afterAll, describe, expect, it, vi } from "vitest";

import {
  ChatwootConversationProvider,
  createDatabase,
  PgmqDeliveryQueue,
  PostgresAuditStore,
  signChatwootPayload,
} from "@replywork/adapters";

import { createServiceRuntime } from "../src/runtime.js";
import { runWorkerOnce } from "../src/worker.js";

const defaultDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const databaseUrl = process.env.REPLYWORK_TEST_DATABASE_URL ?? defaultDatabaseUrl;
const databaseHost = new URL(databaseUrl).hostname;

if (!["127.0.0.1", "::1", "localhost"].includes(databaseHost)) {
  throw new Error("Database tests require a local PostgreSQL connection");
}

const secret = "runtime-database-test-secret";
const testRun = `${process.pid}-${Date.now()}`;
const deliveryId = `runtime-database-test-${testRun}`;
const deliveryKey = `chatwoot:delivery:${deliveryId}`;
const messageId = `runtime-message-${testRun}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const payload = JSON.stringify({
  account: { id: "7" },
  content: "Synthetic runtime database test message.",
  content_type: "text",
  conversation: { id: "19", inbox_id: "3" },
  created_at: timestamp,
  event: "message_created",
  id: messageId,
  message_type: "incoming",
  private: false,
  sender: { id: "runtime-sender", type: "contact" },
});

const database = createDatabase(databaseUrl);
const app = createServiceRuntime({
  CHATWOOT_WEBHOOK_SECRET: secret,
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  PORT: 3000,
});

afterAll(async () => {
  await app.close();
  await database.sql`
    SELECT pgmq.delete('conversation_events', msg_id)
    FROM pgmq.q_conversation_events
    WHERE message ->> 'deliveryKey' = ${deliveryKey}
  `;
  await database.sql`
    DELETE FROM pgmq.a_conversation_events
    WHERE message ->> 'deliveryKey' = ${deliveryKey}
  `;
  await database.sql`
    DELETE FROM replywork.audit_entries
    WHERE delivery_key = ${deliveryKey}
  `;
  await database.sql`
    DELETE FROM replywork.delivery_receipts
    WHERE delivery_key = ${deliveryKey}
  `;
  await database.close();
});

describe("persistent service runtime", () => {
  it("admits a signed webhook to PostgreSQL exactly once", async () => {
    const rawBody = Buffer.from(payload);
    const request = {
      headers: {
        "content-type": "application/json",
        "x-chatwoot-delivery": deliveryId,
        "x-chatwoot-signature": signChatwootPayload(rawBody, timestamp, secret),
        "x-chatwoot-timestamp": timestamp,
      },
      method: "POST" as const,
      payload,
      url: "/webhooks/chatwoot",
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "queued" });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ status: "duplicate" });

    const [state] = await database.sql<
      { auditEntries: number; queuedMessages: number; receipts: number }[]
    >`
      SELECT
        (
          SELECT count(*)::integer
          FROM replywork.audit_entries
          WHERE delivery_key = ${deliveryKey}
        ) AS "auditEntries",
        (
          SELECT count(*)::integer
          FROM pgmq.q_conversation_events
          WHERE message ->> 'deliveryKey' = ${deliveryKey}
        ) AS "queuedMessages",
        (
          SELECT count(*)::integer
          FROM replywork.delivery_receipts
          WHERE delivery_key = ${deliveryKey}
        ) AS receipts
    `;

    expect(state).toEqual({ auditEntries: 1, queuedMessages: 1, receipts: 1 });

    const chatwootFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ payload: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42 }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    const conversationProvider = new ChatwootConversationProvider({
      accountId: 7,
      accessToken: "runtime-test-token",
      baseUrl: "https://chat.example.com",
      fetch: chatwootFetch,
    });
    await expect(
      runWorkerOnce({
        auditStore: new PostgresAuditStore(database.sql),
        conversationProvider,
        deliveryQueue: new PgmqDeliveryQueue(database.sql),
        responder: { decide: async () => ({ kind: "reply", text: "Hello from Replywork." }) },
      }),
    ).resolves.toBe("processed");

    expect(chatwootFetch).toHaveBeenCalledTimes(2);
    expect(String(chatwootFetch.mock.calls[1]?.[0])).toBe(
      "https://chat.example.com/api/v1/accounts/7/conversations/19/messages",
    );
    expect(JSON.parse(String(chatwootFetch.mock.calls[1]?.[1]?.body)) as unknown).toEqual({
      content: "Hello from Replywork.",
      content_type: "text",
      message_type: "outgoing",
      private: false,
      source_id: `${deliveryKey}:reply`,
    });

    const [processedState] = await database.sql<
      { archivedMessages: number; auditEntries: number; queuedMessages: number }[]
    >`
      SELECT
        (
          SELECT count(*)::integer
          FROM pgmq.a_conversation_events
          WHERE message ->> 'deliveryKey' = ${deliveryKey}
        ) AS "archivedMessages",
        (
          SELECT count(*)::integer
          FROM replywork.audit_entries
          WHERE delivery_key = ${deliveryKey}
        ) AS "auditEntries",
        (
          SELECT count(*)::integer
          FROM pgmq.q_conversation_events
          WHERE message ->> 'deliveryKey' = ${deliveryKey}
        ) AS "queuedMessages"
    `;

    expect(processedState).toEqual({ archivedMessages: 1, auditEntries: 2, queuedMessages: 0 });
  });
});
