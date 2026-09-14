import { describe, expect, it, vi } from "vitest";

import { CrispApiError, CrispConversationProvider, fingerprintFor } from "@replywork/adapters";

const requestBody = (init: RequestInit | undefined): unknown =>
  JSON.parse(String(init?.body)) as unknown;

const createProvider = (fetchImplementation: typeof fetch): CrispConversationProvider =>
  new CrispConversationProvider({
    apiBaseUrl: "https://api.example.test/",
    fetch: fetchImplementation,
    tokenIdentifier: "identifier",
    tokenKey: "key",
    websiteId: "website-id",
  });

describe("CrispConversationProvider", () => {
  it("sends an idempotent operator reply", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const provider = createProvider(fetchImplementation);
    const idempotencyKey = "crisp:message:event-1:reply";

    await provider.sendReply({ conversationId: "session_1", idempotencyKey, text: "Hello" });

    const fingerprint = fingerprintFor(idempotencyKey);
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      `https://api.example.test/v1/website/website-id/conversation/session_1/message/${fingerprint}`,
    );
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: `Basic ${Buffer.from("identifier:key").toString("base64")}`,
        "X-Crisp-Tier": "plugin",
      },
      method: "GET",
    });
    expect(requestBody(fetchImplementation.mock.calls[1]?.[1])).toEqual({
      automated: true,
      content: "Hello",
      fingerprint,
      from: "operator",
      origin: "chat",
      type: "text",
    });
  });

  it("skips a reply already present in Crisp", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: false, data: { fingerprint: fingerprintFor("key") } }),
        ),
      );
    const provider = createProvider(fetchImplementation);
    await provider.sendReply({ conversationId: "session_1", idempotencyKey: "key", text: "Hello" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("marks a handoff conversation unresolved", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const provider = createProvider(fetchImplementation);
    await provider.requestHandoff({
      context: {},
      conversationId: "session_1",
      idempotencyKey: "handoff-key",
      reason: "Needs a person",
    });
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      "https://api.example.test/v1/website/website-id/conversation/session_1/state",
    );
    expect(fetchImplementation.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(requestBody(fetchImplementation.mock.calls[0]?.[1])).toEqual({ state: "unresolved" });
  });

  it("reports failures without exposing credentials or response content", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive detail", { status: 401 }));
    const request = createProvider(fetchImplementation).sendReply({
      conversationId: "session_1",
      idempotencyKey: "key",
      text: "Hello",
    });
    await expect(request).rejects.toEqual(new CrispApiError("find reply", 401));
    await expect(request).rejects.not.toThrow(/identifier|key|sensitive detail/);
  });
});
