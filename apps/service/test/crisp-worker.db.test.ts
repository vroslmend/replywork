import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createDatabase,
  CrispConversationProvider,
  PgmqDeliveryQueue,
  PostgresAuditStore,
  PostgresConversationAutomation,
  signCrispPayload,
} from "@replywork/adapters";
import type { ConversationResponder } from "@replywork/core";

import { createServiceApp } from "../src/app.js";
import { runWorkerOnce } from "../src/worker.js";

const databaseUrl =
  process.env.REPLYWORK_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Crisp worker tests require a local database");
}

const run = `${process.pid}_${Date.now()}`;
const websiteId = `crisp-test-${run}`;
const queueName = `crisp_worker_test_${run}`;
const database = createDatabase(databaseUrl);
const queue = new PgmqDeliveryQueue(database.sql, { queueName });
const controls = new PostgresConversationAutomation(database.sql);
const secret = "synthetic-webhook-secret";
const app = createServiceApp({ deliveryQueue: queue, webhook: { provider: "crisp", secret } });
let fingerprint = Date.now();

beforeAll(async () => {
  await database.sql`SELECT pgmq.create(${queueName})`;
});
afterEach(async () => {
  await database.sql`DELETE FROM ${database.sql(`pgmq.q_${queueName}`)}`;
});
afterAll(async () => {
  try {
    await app.close();
    await database.sql`DELETE FROM replywork.conversation_automation WHERE account_id = ${websiteId}`;
    await database.sql`DELETE FROM replywork.audit_entries WHERE delivery_key IN (
      SELECT delivery_key FROM replywork.delivery_receipts WHERE account_id = ${websiteId}
    )`;
    await database.sql`DELETE FROM replywork.delivery_receipts WHERE account_id = ${websiteId}`;
    await database.sql`SELECT pgmq.drop_queue(${queueName})`;
  } finally {
    await database.close();
  }
});

const admit = async (sessionId: string) => {
  const timestamp = String(Date.now());
  fingerprint += 1;
  const payload = JSON.stringify({
    website_id: websiteId,
    event: "message:send",
    timestamp: Number(timestamp),
    data: {
      website_id: websiteId,
      session_id: sessionId,
      type: "text",
      content: "Synthetic question",
      from: "user",
      origin: "chat",
      timestamp: Number(timestamp),
      fingerprint,
      user: { user_id: sessionId },
    },
  });
  const request = {
    method: "POST" as const,
    url: "/webhooks/crisp",
    payload,
    headers: {
      "content-type": "application/json",
      "x-crisp-request-timestamp": timestamp,
      "x-crisp-signature": signCrispPayload(Buffer.from(payload), timestamp, secret),
    },
  };
  const first = await app.inject(request);
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual({ status: "queued" });
  expect((await app.inject(request)).json()).toEqual({ status: "duplicate" });
  return `crisp:message:${websiteId}:${sessionId}:${fingerprint}`;
};

const worker = (
  transport: typeof fetch,
  responder: ConversationResponder = {
    decide: async () => ({ kind: "reply", text: "Synthetic reply" }),
  },
) =>
  runWorkerOnce({
    accountId: websiteId,
    auditStore: new PostgresAuditStore(database.sql),
    conversationAutomation: controls,
    conversationProvider: new CrispConversationProvider({
      websiteId,
      tokenIdentifier: "synthetic-identifier",
      tokenKey: "synthetic-key",
      fetch: transport,
    }),
    deliveryQueue: queue,
    responder,
  });

describe("persistent Crisp delivery path", () => {
  it("admits a duplicate once, sends a reply and archives the delivery", async () => {
    await admit("session_reply");
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    await expect(worker(transport)).resolves.toBe("processed");
    await expect(worker(transport)).resolves.toBe("idle");
    expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body)) as unknown).toMatchObject({
      automated: true,
      content: "Synthetic reply",
      from: "operator",
      type: "text",
    });
  });

  it("keeps a failed reply queued and retries with the same fingerprint", async () => {
    const key = await admit("session_retry");
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    await expect(worker(transport)).rejects.toMatchObject({ status: 503 });
    await database.sql`UPDATE ${database.sql(`pgmq.q_${queueName}`)} SET vt = now()
      WHERE message ->> 'deliveryKey' = ${key}`;
    await expect(worker(transport)).resolves.toBe("processed");
    expect(transport.mock.calls[1]?.[1]?.body).toBe(transport.mock.calls[3]?.[1]?.body);
  });

  it("pauses a handoff conversation and suppresses subsequent customer work", async () => {
    const sessionId = "session_handoff";
    await admit(sessionId);
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    await expect(
      worker(transport, {
        decide: async () => ({ kind: "handoff", reason: "Needs a person", context: {} }),
      }),
    ).resolves.toBe("processed");
    expect(
      (
        await controls.getStatus({
          provider: "crisp",
          accountId: websiteId,
          conversationId: sessionId,
        })
      ).paused,
    ).toBe(true);
    await admit(sessionId);
    await expect(worker(transport)).resolves.toBe("processed");
    expect(transport).toHaveBeenCalledOnce();
  });
});
