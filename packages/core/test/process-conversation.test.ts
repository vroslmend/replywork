import { describe, expect, it, vi } from "vitest";

import type { ConversationEvent } from "@replywork/contracts";
import { processConversation } from "@replywork/core";
import { FakeConversationProvider, MemoryConversationAutomation } from "@replywork/testkit";

const event: ConversationEvent = {
  accountId: "1",
  conversationId: "10",
  deliveryKey: "chatwoot:delivery:delivery-1",
  inboxId: "2",
  message: { contentType: "text", id: "20", text: "Hello" },
  occurredAt: "2026-09-09T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "30" },
};

describe("processConversation", () => {
  it("sends a reply with an action-specific idempotency key", async () => {
    const conversationProvider = new FakeConversationProvider();

    await expect(
      processConversation(event, {
        conversationAutomation: new MemoryConversationAutomation(),
        conversationProvider,
        responder: { decide: async () => ({ kind: "reply", text: "Hello." }) },
      }),
    ).resolves.toBe("reply");

    expect(conversationProvider.replies).toEqual([
      {
        conversationId: "10",
        idempotencyKey: "chatwoot:delivery:delivery-1:reply",
        text: "Hello.",
      },
    ]);
  });

  it("requests a handoff without sending a reply", async () => {
    const conversationProvider = new FakeConversationProvider();

    await expect(
      processConversation(event, {
        conversationAutomation: new MemoryConversationAutomation(),
        conversationProvider,
        responder: {
          decide: async () => ({
            context: { orderId: "order-1" },
            kind: "handoff",
            reason: "operator approval required",
          }),
        },
      }),
    ).resolves.toBe("handoff");

    expect(conversationProvider.replies).toHaveLength(0);
    expect(conversationProvider.handoffs).toEqual([
      {
        context: { orderId: "order-1" },
        conversationId: "10",
        idempotencyKey: "chatwoot:delivery:delivery-1:handoff",
        reason: "operator approval required",
      },
    ]);
  });

  it("keeps a failed handoff paused and retries its saved intent without another decision", async () => {
    const automation = new MemoryConversationAutomation();
    const provider = new FakeConversationProvider();
    const decide = vi
      .fn()
      .mockResolvedValue({ kind: "handoff", context: { orderId: "1" }, reason: "approval" });
    const request = vi
      .spyOn(provider, "requestHandoff")
      .mockRejectedValueOnce(new Error("offline"));
    const dependencies = {
      conversationAutomation: automation,
      conversationProvider: provider,
      responder: { decide },
    };
    await expect(processConversation(event, dependencies)).rejects.toThrow("offline");
    expect((await automation.inspect(event)).paused).toBe(true);
    const later = { ...event, deliveryKey: "chatwoot:delivery:later" };
    await expect(processConversation(later, dependencies)).resolves.toBe("ignored");
    expect(request).toHaveBeenCalledTimes(1);
    await expect(processConversation(event, dependencies)).resolves.toBe("handoff");
    expect(decide).toHaveBeenCalledTimes(1);
    expect(provider.handoffs[0]).toMatchObject({ reason: "approval", context: { orderId: "1" } });
    expect(provider.replies).toHaveLength(0);
  });

  it("suppresses a reply when takeover occurs during the decision", async () => {
    const automation = new MemoryConversationAutomation();
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: {
          decide: async () => {
            await automation.pauseForHandoff(
              { ...event, deliveryKey: "other" },
              { kind: "handoff", context: {}, reason: "takeover" },
            );
            return { kind: "reply", text: "Must not send" };
          },
        },
      }),
    ).resolves.toBe("ignored");
    expect(provider.replies).toHaveLength(0);
  });

  it("discards pre-resume work without consulting the responder", async () => {
    const automation = new MemoryConversationAutomation();
    vi.spyOn(automation, "inspect").mockResolvedValue({
      paused: false,
      discard: true,
      handoff: null,
    });
    const decide = vi.fn();
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: { decide },
      }),
    ).resolves.toBe("ignored");
    expect(decide).not.toHaveBeenCalled();
    expect(provider.replies).toHaveLength(0);
    expect(provider.handoffs).toHaveLength(0);
  });

  it("fails closed if the control store is unavailable", async () => {
    const automation = new MemoryConversationAutomation();
    vi.spyOn(automation, "inspect").mockRejectedValue(new Error("database unavailable"));
    const decide = vi.fn();
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: { decide },
      }),
    ).rejects.toThrow("database unavailable");
    expect(decide).not.toHaveBeenCalled();
    expect(provider.replies).toHaveLength(0);
  });

  it("does not request handoff if a concurrent control change rejects the pause", async () => {
    const automation = new MemoryConversationAutomation();
    vi.spyOn(automation, "pauseForHandoff").mockResolvedValue(false);
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: {
          decide: async () => ({ kind: "handoff", context: {}, reason: "unsupported" }),
        },
      }),
    ).resolves.toBe("ignored");
    expect(provider.handoffs).toHaveLength(0);
  });

  it("does not request handoff if saving its pause fails", async () => {
    const automation = new MemoryConversationAutomation();
    vi.spyOn(automation, "pauseForHandoff").mockRejectedValue(new Error("write failed"));
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: {
          decide: async () => ({ kind: "handoff", context: {}, reason: "unsupported" }),
        },
      }),
    ).rejects.toThrow("write failed");
    expect(provider.handoffs).toHaveLength(0);
  });

  it("does not send a reply if the final state check fails", async () => {
    const automation = new MemoryConversationAutomation();
    vi.spyOn(automation, "inspect")
      .mockResolvedValueOnce({ paused: false, discard: false, handoff: null })
      .mockRejectedValueOnce(new Error("read failed"));
    const provider = new FakeConversationProvider();
    await expect(
      processConversation(event, {
        conversationAutomation: automation,
        conversationProvider: provider,
        responder: { decide: async () => ({ kind: "reply", text: "Must not send" }) },
      }),
    ).rejects.toThrow("read failed");
    expect(provider.replies).toHaveLength(0);
  });
});
