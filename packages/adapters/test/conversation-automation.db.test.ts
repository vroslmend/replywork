import { afterAll, describe, expect, it } from "vitest";

import { createDatabase, PostgresConversationAutomation } from "@replywork/adapters";
import type { ConversationEvent } from "@replywork/contracts";

const databaseUrl =
  process.env.REPLYWORK_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.search !== "") {
  throw new Error(
    "Conversation control tests require a local database URL without query parameters",
  );
}
const database = createDatabase(databaseUrl);
const controls = new PostgresConversationAutomation(database.sql);
const prefix = `conversation-control-test-${process.pid}-${Date.now()}-`;
const handoff = {
  kind: "handoff" as const,
  context: { orderId: "synthetic-order" },
  reason: "operator approval",
};

const admit = async (
  suffix: string,
  conversation = suffix,
  accountId = "7",
): Promise<ConversationEvent> => {
  const event: ConversationEvent = {
    provider: "chatwoot",
    accountId,
    conversationId: `${prefix}${conversation}`,
    deliveryKey: `${prefix}${suffix}`,
    inboxId: "3",
    message: { contentType: "text", id: `${prefix}${suffix}`, text: "Synthetic request" },
    occurredAt: "2026-09-09T10:00:00.000Z",
    sender: { id: "synthetic-contact" },
  };
  await database.sql`
    INSERT INTO replywork.delivery_receipts
      (delivery_key, provider, account_id, inbox_id, conversation_id, message_id, occurred_at)
    VALUES (${event.deliveryKey}, ${event.provider}, ${event.accountId}, ${event.inboxId},
      ${event.conversationId}, ${event.message.id}, ${event.occurredAt})
  `;
  return event;
};

afterAll(async () => {
  try {
    await database.sql`DELETE FROM replywork.conversation_automation WHERE strpos(conversation_id, ${prefix}) = 1`;
    await database.sql`DELETE FROM replywork.delivery_receipts WHERE strpos(delivery_key, ${prefix}) = 1`;
  } finally {
    await database.close();
  }
});

describe("PostgreSQL conversation automation", () => {
  it("defaults admitted conversations to active and rejects unadmitted or mismatched deliveries", async () => {
    const event = await admit("active");
    await expect(controls.inspect(event)).resolves.toEqual({
      paused: false,
      discard: false,
      handoff: null,
    });
    await expect(controls.inspect({ ...event, deliveryKey: "missing" })).rejects.toThrow(
      "admitted",
    );
    await expect(controls.inspect({ ...event, accountId: "8" })).rejects.toThrow("admitted");
    await expect(controls.pauseForHandoff({ ...event, accountId: "8" }, handoff)).resolves.toBe(
      false,
    );
  });

  it("persists the original handoff intent and does not overwrite it on later requests", async () => {
    const event = await admit("intent");
    await expect(controls.pauseForHandoff(event, handoff)).resolves.toBe(true);
    const later = await admit("intent-later", "intent");
    await expect(
      controls.pauseForHandoff(later, { ...handoff, reason: "different" }),
    ).resolves.toBe(false);
    await controls.setPaused(event, true);
    await expect(new PostgresConversationAutomation(database.sql).inspect(later)).resolves.toEqual({
      paused: true,
      discard: false,
      handoff: { deliveryKey: event.deliveryKey, context: handoff.context, reason: handoff.reason },
    });
  });

  it("allows only one concurrent handoff intent for a conversation", async () => {
    const first = await admit("race-first", "race");
    const second = await admit("race-second", "race");
    const results = await Promise.all([
      controls.pauseForHandoff(first, handoff),
      controls.pauseForHandoff(second, handoff),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const state = await controls.inspect(first);
    expect(state.paused).toBe(true);
    expect([first.deliveryKey, second.deliveryKey]).toContain(state.handoff?.deliveryKey);
  });

  it("isolates pauses by account and conversation", async () => {
    const event = await admit("isolation");
    await controls.setPaused(event, true);
    const otherAccount = await admit("isolation-account", "isolation", "8");
    const otherConversation = await admit("isolation-conversation");
    expect((await controls.inspect(otherAccount)).paused).toBe(false);
    expect((await controls.inspect(otherConversation)).paused).toBe(false);
    expect((await controls.inspect(event)).paused).toBe(true);
  });

  it("resume clears the handoff and suppresses older deliveries and failed handoff retries", async () => {
    const event = await admit("resume");
    await controls.pauseForHandoff(event, handoff);
    const backlog = await admit("resume-backlog", "resume");
    await controls.setPaused(event, false);
    await expect(controls.inspect(backlog)).resolves.toEqual({
      paused: false,
      discard: true,
      handoff: null,
    });
    expect((await controls.inspect(event)).discard).toBe(true);
    await expect(controls.pauseForHandoff(event, handoff)).resolves.toBe(false);
    const fresh = await admit("resume-fresh", "resume");
    // Provider timestamps are deliberately old; admission time determines the resume boundary.
    expect((await controls.inspect(fresh)).discard).toBe(false);
    await expect(controls.pauseForHandoff(fresh, handoff)).resolves.toBe(true);
  });

  it("manual pause has no handoff notification and retains the previous resume cutoff", async () => {
    const event = await admit("manual");
    await controls.setPaused(event, false);
    const resumed = await controls.getStatus(event);
    await controls.setPaused(event, true);
    const paused = await controls.getStatus(event);
    expect(paused.paused).toBe(true);
    expect(paused.resumedAt).toEqual(resumed.resumedAt);
    expect(paused.changedAt).toEqual(expect.any(String));
    await expect(controls.inspect(event)).resolves.toEqual({
      paused: true,
      discard: true,
      handoff: null,
    });
  });

  it("keeps the control table private with row-level security and no public policies", async () => {
    const [row] = await database.sql<
      { rls: boolean; publicPolicies: number; publicGrants: number }[]
    >`
      SELECT c.relrowsecurity AS rls,
        (SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'replywork' AND tablename = 'conversation_automation') AS "publicPolicies",
        (SELECT count(*)::integer FROM information_schema.table_privileges
          WHERE table_schema = 'replywork' AND table_name = 'conversation_automation' AND grantee = 'PUBLIC') AS "publicGrants"
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'replywork' AND c.relname = 'conversation_automation'
    `;
    expect(row).toEqual({ rls: true, publicPolicies: 0, publicGrants: 0 });
  });
});
