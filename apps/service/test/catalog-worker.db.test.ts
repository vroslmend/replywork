import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ChatwootConversationProvider,
  createDatabase,
  PgmqDeliveryQueue,
  PostgresAuditStore,
  PostgresCatalog,
  PostgresConversationAutomation,
  signChatwootPayload,
} from "@replywork/adapters";
import type { CatalogInterpreter } from "@replywork/core";

import { createServiceApp } from "../src/app.js";
import { loadWorkerConfig } from "../src/config.js";
import { runWorkerOnce } from "../src/worker.js";
import { createWorkerResponder } from "../src/worker-responder.js";

const databaseUrl =
  process.env.REPLYWORK_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.search !== "") {
  throw new Error("Catalog worker tests require a local database URL without query parameters");
}

const run = `${process.pid}_${Date.now()}`;
const queueName = `catalog_worker_test_${run}`;
const deliveryPrefix = `chatwoot:delivery:catalog-worker-${run}-`;
const productId = `catalog-worker-product-${run}`;
const conversationPrefix = `catalog-worker-conversation-${run}-`;
const database = createDatabase(databaseUrl);
const queue = new PgmqDeliveryQueue(database.sql, { queueName });
const auditStore = new PostgresAuditStore(database.sql);
const secret = "catalog-worker-test-secret";
const app = createServiceApp({ deliveryQueue: queue, webhookSecret: secret });
const config = loadWorkerConfig({
  CHATWOOT_ACCOUNT_ID: "7",
  CHATWOOT_API_ACCESS_TOKEN: "test-token",
  CHATWOOT_BASE_URL: "https://chat.example.com",
  CHATWOOT_HANDOFF_TEAM_ID: "4",
  DATABASE_URL: databaseUrl,
  REPLYWORK_RESPONDER: "catalog",
});

beforeAll(async () => {
  await database.sql`SELECT pgmq.create(${queueName})`;
  await database.sql`
    INSERT INTO replywork.catalog_items (id, name, description, currency, price_minor, available, approved)
    VALUES (${productId}, 'Synthetic tote', 'Synthetic cotton bag.', 'PKR', 180000, false, true)
  `;
});

afterEach(async () => {
  await database.sql`DELETE FROM ${database.sql(`pgmq.q_${queueName}`)}`;
});

afterAll(async () => {
  try {
    await app.close();
    await database.sql`DELETE FROM replywork.conversation_automation WHERE strpos(conversation_id, ${conversationPrefix}) = 1`;
    await database.sql`DELETE FROM replywork.audit_entries WHERE strpos(delivery_key, ${deliveryPrefix}) = 1`;
    await database.sql`DELETE FROM replywork.delivery_receipts WHERE strpos(delivery_key, ${deliveryPrefix}) = 1`;
    await database.sql`DELETE FROM replywork.catalog_items WHERE id = ${productId}`;
    await database.sql`SELECT pgmq.drop_queue(${queueName})`;
  } finally {
    await database.close();
  }
});

const admit = async (suffix: string, text: string, accountId = "7", conversation = suffix) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const deliveryId = `catalog-worker-${run}-${suffix}`;
  const payload = JSON.stringify({
    account: { id: accountId },
    content: text,
    content_type: "text",
    conversation: { id: `${conversationPrefix}${conversation}`, inbox_id: "3" },
    created_at: timestamp,
    event: "message_created",
    id: `${run}-${suffix}`,
    message_type: "incoming",
    private: false,
    sender: { id: "9", type: "contact" },
  });
  const request = {
    headers: {
      "content-type": "application/json",
      "x-chatwoot-delivery": deliveryId,
      "x-chatwoot-signature": signChatwootPayload(Buffer.from(payload), timestamp, secret),
      "x-chatwoot-timestamp": timestamp,
    },
    method: "POST" as const,
    payload,
    url: "/webhooks/chatwoot",
  };
  expect((await app.inject(request)).json()).toEqual({ status: "queued" });
  expect((await app.inject(request)).json()).toEqual({ status: "duplicate" });
  return `chatwoot:delivery:${deliveryId}`;
};

const transport = () =>
  vi.fn<typeof fetch>().mockImplementation(
    async (_url, init) =>
      new Response(JSON.stringify(init?.method === "GET" ? { payload: [] } : { id: 42 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
  );
const worker = (chatwootFetch: typeof fetch, interpreter?: CatalogInterpreter) =>
  runWorkerOnce({
    accountId: String(config.CHATWOOT_ACCOUNT_ID),
    auditStore,
    conversationAutomation: new PostgresConversationAutomation(database.sql),
    deliveryQueue: queue,
    conversationProvider: new ChatwootConversationProvider({
      accountId: config.CHATWOOT_ACCOUNT_ID,
      accessToken: config.CHATWOOT_API_ACCESS_TOKEN,
      baseUrl: config.CHATWOOT_BASE_URL,
      fetch: chatwootFetch,
      handoffTeamId: 4,
    }),
    responder: createWorkerResponder(
      interpreter === undefined
        ? config
        : {
            ...config,
            REPLYWORK_RESPONDER: "catalog-natural",
            GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key",
            REPLYWORK_CATALOG_MODEL: "synthetic-model",
          },
      {
        auditStore,
        catalog: new PostgresCatalog(database.sql),
        ...(interpreter === undefined ? {} : { interpreter }),
      },
    ),
  });
const audits = (deliveryKey: string) => database.sql<
  { kind: string; outcome: string; details: Record<string, unknown> }[]
>`
  SELECT kind, outcome, details FROM replywork.audit_entries WHERE delivery_key = ${deliveryKey} ORDER BY id
`;

describe("catalog conversation worker", () => {
  it("answers an interpreted price question through the real catalog and audits no customer text", async () => {
    const question = `How much is ${productId}?`;
    const key = await admit("natural-price", question);
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "search", query: productId, topic: "price" }),
    };
    const fetch = transport();
    await expect(worker(fetch, interpreter)).resolves.toBe("processed");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as unknown).toMatchObject({
      private: false,
      source_id: `${key}:reply`,
      content: `Synthetic tote (${productId})\nRecorded price: PKR 1,800.00. This does not include a checkout calculation.`,
    });
    expect((await audits(key)).map(({ kind, outcome }) => ({ kind, outcome }))).toEqual([
      { kind: "delivery", outcome: "succeeded" },
      { kind: "tool", outcome: "succeeded" },
      { kind: "tool", outcome: "succeeded" },
      { kind: "reply", outcome: "succeeded" },
    ]);
    expect(JSON.stringify(await audits(key))).not.toContain(question);
  });

  it("does not interpret a new message after natural-language handoff pauses the conversation", async () => {
    await admit("natural-handoff", "Track my order", "7", "natural-control");
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "handoff", query: null, topic: null }),
    };
    const fetch = transport();
    await expect(worker(fetch, interpreter)).resolves.toBe("processed");
    const count = fetch.mock.calls.length;
    const key = await admit("natural-paused", "Price of tote?", "7", "natural-control");
    await expect(worker(fetch, interpreter)).resolves.toBe("processed");
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(count);
    expect((await audits(key))[1]).toMatchObject({ kind: "delivery", outcome: "ignored" });
  });

  it("leaves a failed interpretation queued and makes no provider request", async () => {
    const key = await admit("natural-failure", "Price of tote?");
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockRejectedValue(new Error("model unavailable")),
    };
    const fetch = transport();
    await expect(worker(fetch, interpreter)).rejects.toThrow("model unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect((await audits(key)).map(({ kind, outcome }) => ({ kind, outcome }))).toEqual([
      { kind: "delivery", outcome: "succeeded" },
      { kind: "tool", outcome: "failed" },
      { kind: "delivery", outcome: "failed" },
    ]);
    const [row] = await database.sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM ${database.sql(`pgmq.q_${queueName}`)} WHERE message ->> 'deliveryKey' = ${key}`;
    expect(row?.count).toBe(1);
  });
  it("processes a signed catalog request into a grounded outgoing API request and audit", async () => {
    const key = await admit("reply", `/catalog ${productId}`);
    const fetch = transport();
    await expect(worker(fetch)).resolves.toBe("processed");
    const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      private: false,
      message_type: "outgoing",
      source_id: `${key}:reply`,
      content: `Catalog matches:\n\nSynthetic tote (${productId})\nPKR 1,800.00; listed as unavailable\nSynthetic cotton bag.`,
    });
    expect((await audits(key)).map(({ kind, outcome }) => ({ kind, outcome }))).toEqual([
      { kind: "delivery", outcome: "succeeded" },
      { kind: "tool", outcome: "succeeded" },
      { kind: "reply", outcome: "succeeded" },
    ]);
    expect((await audits(key))[1]?.details).toMatchObject({
      productIds: [productId],
      resultCount: 1,
    });
    await expect(worker(fetch)).resolves.toBe("idle");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends a no-match reply rather than inventing product facts", async () => {
    const key = await admit("missing", `/catalog missing-${run}`);
    const fetch = transport();
    await expect(worker(fetch)).resolves.toBe("processed");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as unknown).toMatchObject({
      content: "I couldn't find a product matching that search. Try another product name or ID.",
      private: false,
    });
    expect((await audits(key))[1]?.details).toMatchObject({ productIds: [], resultCount: 0 });
  });

  it("routes unsupported requests to a private note, team assignment and open conversation", async () => {
    const key = await admit("handoff", "Where is my order?");
    const fetch = transport();
    await expect(worker(fetch)).resolves.toBe("processed");
    const bodies = fetch.mock.calls
      .slice(1)
      .map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
    expect(bodies[0]).toMatchObject({ private: true, source_id: `${key}:handoff:note` });
    expect(bodies[1]).toEqual({ team_id: 4 });
    expect(bodies[2]).toEqual({ status: "open" });
    expect((await audits(key)).map((entry) => entry.kind)).toEqual(["delivery", "handoff"]);
  });

  it("leaves a failed API write queued and successfully retries after visibility release", async () => {
    const key = await admit("retry", `/catalog ${productId}`);
    const fetch = transport();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ payload: [] }), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(worker(fetch)).rejects.toMatchObject({ status: 503 });
    const [queued] = await database.sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM ${database.sql(`pgmq.q_${queueName}`)} WHERE message ->> 'deliveryKey' = ${key}
    `;
    expect(queued?.count).toBe(1);
    await database.sql`
      UPDATE ${database.sql(`pgmq.q_${queueName}`)} SET vt = now() WHERE message ->> 'deliveryKey' = ${key}
    `;
    await expect(worker(fetch)).resolves.toBe("processed");
    expect((await audits(key)).map(({ kind, outcome }) => ({ kind, outcome }))).toEqual([
      { kind: "delivery", outcome: "succeeded" },
      { kind: "tool", outcome: "succeeded" },
      { kind: "delivery", outcome: "failed" },
      { kind: "tool", outcome: "succeeded" },
      { kind: "reply", outcome: "succeeded" },
    ]);
    await expect(worker(fetch)).resolves.toBe("idle");
  });

  it("does not search or write to the configured provider for another account", async () => {
    const key = await admit("wrong-account", `/catalog ${productId}`, "8");
    const fetch = transport();
    await expect(worker(fetch)).rejects.toThrow("account");
    expect(fetch).not.toHaveBeenCalled();
    expect((await audits(key)).map(({ kind, outcome }) => ({ kind, outcome }))).toEqual([
      { kind: "delivery", outcome: "succeeded" },
      { kind: "delivery", outcome: "failed" },
    ]);
  });

  it("pauses before a failed handoff, suppresses later work and resumes only new deliveries", async () => {
    const key = await admit("control-handoff", "Where is my order?", "7", "control");
    const fetch = transport();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ payload: [] }), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(worker(fetch)).rejects.toMatchObject({ status: 503 });
    const controls = new PostgresConversationAutomation(database.sql);
    const scope = {
      provider: "chatwoot" as const,
      accountId: "7",
      conversationId: `${conversationPrefix}control`,
    };
    expect((await controls.getStatus(scope)).paused).toBe(true);
    const ignoredKey = await admit("control-ignored", `/catalog ${productId}`, "7", "control");
    await expect(worker(fetch)).resolves.toBe("processed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await audits(ignoredKey)).map((entry) => entry.kind)).toEqual(["delivery", "delivery"]);
    expect((await audits(ignoredKey))[1]).toMatchObject({ outcome: "ignored" });
    await database.sql`UPDATE ${database.sql(`pgmq.q_${queueName}`)} SET vt = now() WHERE message ->> 'deliveryKey' = ${key}`;
    await expect(worker(fetch)).resolves.toBe("processed");
    expect((await controls.getStatus(scope)).paused).toBe(true);
    const backlogKey = await admit("control-backlog", `/catalog ${productId}`, "7", "control");
    await controls.setPaused(scope, false);
    const callCount = fetch.mock.calls.length;
    await expect(worker(fetch)).resolves.toBe("processed");
    expect(fetch).toHaveBeenCalledTimes(callCount);
    expect((await audits(backlogKey))[1]).toMatchObject({ kind: "delivery", outcome: "ignored" });
    await admit("control-new", `/catalog ${productId}`, "7", "control");
    await expect(worker(fetch)).resolves.toBe("processed");
    expect(fetch).toHaveBeenCalledTimes(callCount + 2);
    expect((await controls.getStatus(scope)).paused).toBe(false);
  });
});
