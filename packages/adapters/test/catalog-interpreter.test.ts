import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

import { AiCatalogInterpreter, createGoogleCatalogInterpreter } from "@replywork/adapters";

const modelFor = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "STOP" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 20, text: 20, reasoning: 0 },
      },
      warnings: [],
    },
  });

describe("AI SDK catalog interpreter", () => {
  it("exercises Google's actual adapter with a controlled transport, not a live API", async () => {
    const request = { kind: "search", query: "canvas tote", topic: "price" };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text: JSON.stringify(request) }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const interpreter = createGoogleCatalogInterpreter({
      apiKey: "synthetic-key",
      modelId: "synthetic-model",
      fetch: transport,
    });
    await expect(interpreter.interpret("Price of canvas tote?")).resolves.toEqual(request);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0]?.[0])).toContain(
      "models/synthetic-model:generateContent",
    );
    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as {
      generationConfig: Record<string, unknown>;
      tools?: unknown;
    };
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      maxOutputTokens: 512,
    });
    expect(body.tools).toBeUndefined();
  });
  it("requests structured classification without tools and treats input as a user message", async () => {
    const request = { kind: "search", query: "canvas tote", topic: "price" };
    const model = modelFor(JSON.stringify(request));
    const text = "How much is the canvas tote?";
    await expect(new AiCatalogInterpreter(model).interpret(text)).resolves.toEqual(request);
    const call = model.doGenerateCalls[0];
    expect(call?.maxOutputTokens).toBe(512);
    expect(call?.responseFormat?.type).toBe("json");
    expect(call?.tools ?? []).toEqual([]);
    expect(call?.abortSignal).toBeDefined();
    expect(call?.prompt).toContainEqual({ role: "user", content: [{ type: "text", text }] });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it.each([
    "not JSON",
    JSON.stringify({ kind: "search", query: null, topic: "price" }),
    JSON.stringify({ kind: "handoff", query: "tote", topic: "price" }),
    JSON.stringify({ kind: "order", query: "tote", topic: "price" }),
    JSON.stringify({ kind: "search", query: "tote", topic: "price", reply: "PKR 1" }),
  ])("rejects malformed or out-of-bound model output", async (text) => {
    const model = modelFor(text);
    await expect(new AiCatalogInterpreter(model).interpret("Price of tote?")).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("does not retry internally when the provider fails", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("provider unavailable");
      },
    });
    await expect(new AiCatalogInterpreter(model).interpret("Price of tote?")).rejects.toThrow(
      "provider unavailable",
    );
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it.each(["", " ", "a".repeat(2001), "tote\0"])(
    "rejects invalid input without a model call",
    async (text) => {
      const model = modelFor("{}");
      await expect(new AiCatalogInterpreter(model).interpret(text)).rejects.toThrow(
        "Catalog interpretation",
      );
      expect(model.doGenerateCalls).toHaveLength(0);
    },
  );
});
