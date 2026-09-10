import { describe, expect, it, vi } from "vitest";

import { ChatwootApiError, ChatwootConversationProvider } from "@replywork/adapters";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const requestBody = (init: RequestInit | undefined): unknown =>
  JSON.parse(String(init?.body)) as unknown;

const createProvider = (
  fetchImplementation: typeof fetch,
  options: { handoffTeamId?: number } = {},
): ChatwootConversationProvider =>
  new ChatwootConversationProvider({
    accountId: 7,
    accessToken: "test-token",
    baseUrl: "https://chat.example.com/",
    fetch: fetchImplementation,
    ...options,
  });

describe("ChatwootConversationProvider", () => {
  it("sends an outgoing reply with a stable source ID", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ payload: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 42 }));
    const provider = createProvider(fetchImplementation);

    await provider.sendReply({
      conversationId: "19",
      idempotencyKey: "chatwoot:delivery:event-1:reply",
      text: "We are open until 6 PM.",
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [listUrl, listInit] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(listUrl)).toBe(
      "https://chat.example.com/api/v1/accounts/7/conversations/19/messages",
    );
    expect(listInit?.method).toBe("GET");
    expect(listInit?.headers).toMatchObject({ api_access_token: "test-token" });

    const [createUrl, createInit] = fetchImplementation.mock.calls[1] ?? [];
    expect(String(createUrl)).toBe(String(listUrl));
    expect(createInit?.method).toBe("POST");
    expect(requestBody(createInit)).toEqual({
      content: "We are open until 6 PM.",
      content_type: "text",
      message_type: "outgoing",
      private: false,
      source_id: "chatwoot:delivery:event-1:reply",
    });
  });

  it("does not repeat a reply already present in Chatwoot", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        payload: [{ source_id: "chatwoot:delivery:event-1:reply" }],
      }),
    );
    const provider = createProvider(fetchImplementation);

    await provider.sendReply({
      conversationId: "19",
      idempotencyKey: "chatwoot:delivery:event-1:reply",
      text: "We are open until 6 PM.",
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("records a private note, assigns a team and opens a handoff", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ payload: [] }))
      .mockImplementation(async () => jsonResponse({ success: true }));
    const provider = createProvider(fetchImplementation, { handoffTeamId: 12 });

    await provider.requestHandoff({
      context: { orderId: "ORDER-42" },
      conversationId: "19",
      idempotencyKey: "chatwoot:delivery:event-1:handoff",
      reason: "Customer identity could not be verified",
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(requestBody(fetchImplementation.mock.calls[1]?.[1])).toEqual({
      content:
        "Replywork requested a human handoff.\n\nReason: Customer identity could not be verified",
      content_attributes: {
        replywork: {
          context: { orderId: "ORDER-42" },
          reason: "Customer identity could not be verified",
        },
      },
      content_type: "text",
      message_type: "outgoing",
      private: true,
      source_id: "chatwoot:delivery:event-1:handoff:note",
    });
    expect(
      String(fetchImplementation.mock.calls[2]?.[0]).endsWith("/conversations/19/assignments"),
    ).toBe(true);
    expect(requestBody(fetchImplementation.mock.calls[2]?.[1])).toEqual({ team_id: 12 });
    expect(
      String(fetchImplementation.mock.calls[3]?.[0]).endsWith("/conversations/19/toggle_status"),
    ).toBe(true);
    expect(requestBody(fetchImplementation.mock.calls[3]?.[1])).toEqual({ status: "open" });
  });

  it("reports an API failure without including response content or credentials", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: "sensitive upstream detail" }, 401));
    const provider = createProvider(fetchImplementation);

    const request = provider.sendReply({
      conversationId: "19",
      idempotencyKey: "chatwoot:delivery:event-1:reply",
      text: "Hello",
    });

    await expect(request).rejects.toEqual(new ChatwootApiError("list messages", 401));
    await expect(request).rejects.not.toThrow(/test-token|sensitive upstream detail/);
  });
});
