import { describe, expect, it, vi } from "vitest";

import type { CatalogItem, CatalogRequest, ConversationEvent } from "@replywork/contracts";
import {
  CatalogResponder,
  type AuditStore,
  type CatalogCapability,
  type CatalogInterpreter,
} from "@replywork/core";

const product: CatalogItem = {
  id: "synthetic-tote",
  name: "Canvas tote",
  description: "Synthetic cotton bag.",
  currency: "PKR",
  priceMinor: 180000,
  available: false,
};
const eventFor = (text: string): ConversationEvent => ({
  accountId: "7",
  conversationId: "19",
  deliveryKey: "chatwoot:delivery:natural-catalog-test",
  inboxId: "3",
  message: { contentType: "text", id: "42", text },
  occurredAt: "2026-09-13T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "9" },
});
const setup = (request: CatalogRequest, items: readonly CatalogItem[] = [product]) => {
  const interpreter = {
    interpret: vi.fn<CatalogInterpreter["interpret"]>().mockResolvedValue(request),
  };
  const catalog = {
    searchCatalog: vi.fn<CatalogCapability["searchCatalog"]>().mockResolvedValue(items),
  };
  const auditStore = { append: vi.fn<AuditStore["append"]>().mockResolvedValue(undefined) };
  return {
    interpreter,
    catalog,
    auditStore,
    responder: new CatalogResponder({ interpreter, catalog, auditStore }),
  };
};

describe("natural catalog decisions", () => {
  it("answers a price question using recorded minor units, not model prose", async () => {
    const { responder, catalog, interpreter, auditStore } = setup({
      kind: "search",
      query: "canvas tote",
      topic: "price",
    });
    const event = eventFor("How much is the canvas tote?");
    await expect(responder.decide(event)).resolves.toEqual({
      kind: "reply",
      text: "Canvas tote (synthetic-tote)\nRecorded price: PKR 1,800.00. This does not include a checkout calculation.",
    });
    expect(interpreter.interpret).toHaveBeenCalledWith(event.message.text);
    expect(catalog.searchCatalog).toHaveBeenCalledWith({ limit: 5, text: "canvas tote" });
    expect(auditStore.append.mock.calls.map(([entry]) => entry.details.operation)).toEqual([
      "interpret",
      "search",
    ]);
    expect(JSON.stringify(auditStore.append.mock.calls)).not.toContain(event.message.text);
    expect(auditStore.append.mock.calls[0]?.[0].details).not.toHaveProperty("query");
  });

  it("uses explicit stored unavailability without promising live stock", async () => {
    const { responder } = setup({ kind: "search", query: "tote", topic: "availability" });
    await expect(responder.decide(eventFor("Do you have the tote?"))).resolves.toEqual({
      kind: "reply",
      text: "Canvas tote (synthetic-tote)\nListed as unavailable in the catalog. This is not a stock reservation.",
    });
  });

  it("returns stored descriptions for product details", async () => {
    const { responder } = setup({ kind: "search", query: "tote", topic: "details" });
    const decision = await responder.decide(eventFor("Tell me about the tote"));
    expect(decision).toMatchObject({
      kind: "reply",
      text: expect.stringContaining(product.description),
    });
  });

  it.each(["price", "availability"] as const)(
    "clarifies ambiguous %s matches instead of choosing a product",
    async (topic) => {
      const { responder } = setup({ kind: "search", query: "tote", topic }, [
        product,
        { ...product, id: "large-tote", name: "Large tote", priceMinor: 300000 },
      ]);
      const decision = await responder.decide(eventFor("How much is the tote?"));
      expect(decision).toEqual({
        kind: "reply",
        text: "Which product did you mean? Send its name or ID.\n\nCanvas tote (synthetic-tote)\nLarge tote (large-tote)",
      });
    },
  );

  it("does not invent a replacement for a missing product", async () => {
    const { responder } = setup({ kind: "search", query: "missing", topic: "price" }, []);
    expect(await responder.decide(eventFor("Price of missing?"))).toMatchObject({
      kind: "reply",
      text: expect.stringContaining("couldn't find"),
    });
  });

  it.each(["clarify", "handoff"] as const)("does not search on a %s decision", async (kind) => {
    const { responder, catalog } = setup({ kind, query: null, topic: null });
    expect((await responder.decide(eventFor("How much is it?"))).kind).toBe(
      kind === "clarify" ? "reply" : "handoff",
    );
    expect(catalog.searchCatalog).not.toHaveBeenCalled();
  });

  it("preserves explicit command handling without spending a model call", async () => {
    const { responder, interpreter, catalog } = setup({
      kind: "handoff",
      query: null,
      topic: null,
    });
    expect((await responder.decide(eventFor("/catalog tote"))).kind).toBe("reply");
    expect(interpreter.interpret).not.toHaveBeenCalled();
    expect(catalog.searchCatalog).toHaveBeenCalledWith({ limit: 5, text: "tote" });
  });

  it.each([" ", "a".repeat(2001), "tote\0"])(
    "rejects invalid input before calling the interpreter",
    async (text) => {
      const { responder, interpreter, catalog } = setup({
        kind: "search",
        query: "tote",
        topic: "details",
      });
      expect((await responder.decide(eventFor(text))).kind).toBe("reply");
      expect(interpreter.interpret).not.toHaveBeenCalled();
      expect(catalog.searchCatalog).not.toHaveBeenCalled();
    },
  );

  it("audits interpreter failure and propagates it for worker retry", async () => {
    const { responder, interpreter, catalog, auditStore } = setup({
      kind: "clarify",
      query: null,
      topic: null,
    });
    interpreter.interpret.mockRejectedValue(new Error("model unavailable"));
    await expect(responder.decide(eventFor("Price of tote?"))).rejects.toThrow("model unavailable");
    expect(catalog.searchCatalog).not.toHaveBeenCalled();
    expect(auditStore.append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tool",
        outcome: "failed",
        details: { capability: "catalog", operation: "interpret" },
      }),
    );
  });

  it("validates interpreter output again at the core boundary", async () => {
    const { responder, interpreter, catalog } = setup({
      kind: "search",
      query: "tote",
      topic: "price",
    });
    interpreter.interpret.mockResolvedValue({ kind: "search", query: null, topic: "price" });
    await expect(responder.decide(eventFor("Price of tote?"))).rejects.toThrow();
    expect(catalog.searchCatalog).not.toHaveBeenCalled();
  });

  it("clarifies invented search terms instead of querying an unmentioned product", async () => {
    const { responder, catalog } = setup({ kind: "search", query: "premium bag", topic: "price" });
    expect(await responder.decide(eventFor("Price of tote?"))).toMatchObject({
      kind: "reply",
      text: expect.stringContaining("Which product"),
    });
    expect(catalog.searchCatalog).not.toHaveBeenCalled();
  });

  it("matches mentioned queries across case and repeated whitespace", async () => {
    const { responder, catalog } = setup({ kind: "search", query: "canvas tote", topic: "price" });
    expect((await responder.decide(eventFor("Price of CANVAS   TOTE?"))).kind).toBe("reply");
    expect(catalog.searchCatalog).toHaveBeenCalledWith({ limit: 5, text: "canvas tote" });
  });

  it("does not look up data if interpretation auditing fails", async () => {
    const { responder, auditStore, catalog } = setup({
      kind: "search",
      query: "tote",
      topic: "price",
    });
    auditStore.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(responder.decide(eventFor("Price of tote?"))).rejects.toThrow("audit unavailable");
    expect(catalog.searchCatalog).not.toHaveBeenCalled();
  });
});
