import { describe, expect, it, vi } from "vitest";

import type { ConversationEvent } from "@replywork/contracts";
import type { AuditStore, CatalogCapability, CatalogInterpreter } from "@replywork/core";

import { loadWorkerConfig } from "../src/config.js";
import { createWorkerResponder } from "../src/worker-responder.js";

const environment = {
  CHATWOOT_ACCOUNT_ID: "7",
  CHATWOOT_API_ACCESS_TOKEN: "test-token",
  CHATWOOT_BASE_URL: "https://chat.example.com",
  DATABASE_URL: "postgresql://localhost/postgres",
  REPLYWORK_REPLY_TEXT: "Fixed test reply.",
};
const event: ConversationEvent = {
  accountId: "7",
  conversationId: "19",
  deliveryKey: "chatwoot:delivery:selection-test",
  inboxId: "3",
  message: { contentType: "text", id: "42", text: "/catalog tote" },
  occurredAt: "2026-09-13T10:00:00.000Z",
  provider: "chatwoot",
  sender: { id: "9" },
};
const dependencies = () => ({
  auditStore: { append: vi.fn<AuditStore["append"]>().mockResolvedValue(undefined) },
  catalog: { searchCatalog: vi.fn<CatalogCapability["searchCatalog"]>().mockResolvedValue([]) },
});

describe("worker responder selection", () => {
  it("keeps the fixed responder as the default", async () => {
    const ports = dependencies();
    await expect(
      createWorkerResponder(loadWorkerConfig(environment), ports).decide(event),
    ).resolves.toEqual({
      kind: "reply",
      text: "Fixed test reply.",
    });
    expect(ports.catalog.searchCatalog).not.toHaveBeenCalled();
  });

  it("selects catalog mode without requiring fixed reply text", async () => {
    const ports = dependencies();
    const config = loadWorkerConfig({
      ...environment,
      REPLYWORK_RESPONDER: "catalog",
      REPLYWORK_REPLY_TEXT: "",
    });
    await expect(createWorkerResponder(config, ports).decide(event)).resolves.toMatchObject({
      kind: "reply",
    });
    expect(ports.catalog.searchCatalog).toHaveBeenCalledWith({ limit: 5, text: "tote" });
  });

  it.each(["catalog", "fixed"])(
    "rejects a different account before processing in %s mode",
    async (mode) => {
      const ports = dependencies();
      const responder = createWorkerResponder(
        loadWorkerConfig({ ...environment, REPLYWORK_RESPONDER: mode }),
        ports,
      );
      await expect(responder.decide({ ...event, accountId: "8" })).rejects.toThrow("account");
      expect(ports.catalog.searchCatalog).not.toHaveBeenCalled();
      expect(ports.auditStore.append).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown modes and a fixed worker without reply text", () => {
    expect(() => loadWorkerConfig({ ...environment, REPLYWORK_RESPONDER: "ai" })).toThrow();
    expect(() => loadWorkerConfig({ ...environment, REPLYWORK_REPLY_TEXT: "" })).toThrow();
  });

  it("selects natural catalog mode only with explicit model configuration and an interpreter", async () => {
    const ports = dependencies();
    const config = loadWorkerConfig({
      ...environment,
      REPLYWORK_RESPONDER: "catalog-natural",
      GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key",
      REPLYWORK_CATALOG_MODEL: "synthetic-model",
    });
    expect(() => createWorkerResponder(config, ports)).toThrow("requires an interpreter");
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "search", query: "tote", topic: "price" }),
    };
    const responder = createWorkerResponder(config, { ...ports, interpreter });
    expect(
      (await responder.decide({ ...event, message: { ...event.message, text: "Price of tote?" } }))
        .kind,
    ).toBe("reply");
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
    await expect(responder.decide({ ...event, accountId: "8" })).rejects.toThrow("account");
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
  });

  it("does not enable an injected interpreter in command-only catalog mode", async () => {
    const ports = dependencies();
    const interpreter = { interpret: vi.fn<CatalogInterpreter["interpret"]>() };
    const responder = createWorkerResponder(
      loadWorkerConfig({ ...environment, REPLYWORK_RESPONDER: "catalog" }),
      { ...ports, interpreter },
    );
    expect(
      (await responder.decide({ ...event, message: { ...event.message, text: "Price of tote?" } }))
        .kind,
    ).toBe("handoff");
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });

  it.each([
    { GOOGLE_GENERATIVE_AI_API_KEY: "", REPLYWORK_CATALOG_MODEL: "synthetic-model" },
    { GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key", REPLYWORK_CATALOG_MODEL: "" },
  ])("rejects missing natural catalog credentials/configuration", (fields) => {
    expect(() =>
      loadWorkerConfig({ ...environment, REPLYWORK_RESPONDER: "catalog-natural", ...fields }),
    ).toThrow();
  });
});
