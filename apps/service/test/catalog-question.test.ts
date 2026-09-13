import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { CatalogCapability, CatalogInterpreter } from "@replywork/core";
import { answerCatalogQuestion, parseCatalogQuestionArguments } from "../src/catalog-question.js";
import { loadCatalogQuestionConfig } from "../src/config.js";

const product = {
  id: "synthetic-tote",
  name: "Canvas tote",
  description: "Synthetic cotton bag.",
  currency: "PKR",
  priceMinor: 180000,
  available: false,
};
const setup = () => ({
  catalog: {
    searchCatalog: vi.fn<CatalogCapability["searchCatalog"]>().mockResolvedValue([product]),
  },
  interpreter: {
    interpret: vi
      .fn<CatalogInterpreter["interpret"]>()
      .mockResolvedValue({ kind: "search", query: "canvas tote", topic: "details" }),
  },
});

describe("catalog question command", () => {
  it("requires one quoted question and explicit live opt-in", () => {
    expect(parseCatalogQuestionArguments(["  Price of canvas tote?  "])).toEqual({
      run: false,
      question: "Price of canvas tote?",
    });
    expect(parseCatalogQuestionArguments(["--run", "Price of canvas tote?"])).toEqual({
      run: true,
      question: "Price of canvas tote?",
    });
  });
  it.each(
    [[], [" "], ["price", "tote"], ["a".repeat(2001)], ["tote\0"], ["--unknown", "tote"]].map(
      (args) => ({ args }),
    ),
  )("rejects invalid arguments $args", ({ args }) => {
    expect(() => parseCatalogQuestionArguments(args)).toThrow();
  });
  it("needs only database and Google settings", () => {
    const environment = {
      DATABASE_URL: "postgresql://localhost/replywork",
      GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key",
      REPLYWORK_CATALOG_MODEL: "synthetic-model",
    };
    expect(loadCatalogQuestionConfig(environment)).toEqual(environment);
    expect(() =>
      loadCatalogQuestionConfig({ ...environment, DATABASE_URL: "https://example.com" }),
    ).toThrow();
    expect(() =>
      loadCatalogQuestionConfig({ ...environment, GOOGLE_GENERATIVE_AI_API_KEY: "" }),
    ).toThrow();
  });
  it("previews through the real CLI without any configuration", () => {
    const result = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        "apps/service/src/catalog-question-main.ts",
        "Price of canvas tote?",
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: {
          ...process.env,
          DATABASE_URL: "",
          GOOGLE_GENERATIVE_AI_API_KEY: "",
          REPLYWORK_CATALOG_MODEL: "",
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout) as unknown).toEqual({
      mode: "preview",
      maxModelCalls: 1,
      question: "Price of canvas tote?",
    });
  });
  it("fails safely before constructing clients for a nonlocal database", () => {
    const result = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        "apps/service/src/catalog-question-main.ts",
        "--run",
        "Price of canvas tote?",
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://synthetic-user:synthetic-private-password@db.example.com/replywork",
          GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-private-key",
          REPLYWORK_CATALOG_MODEL: "synthetic-model",
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("reachable local DATABASE_URL");
    expect(result.stderr).not.toContain("synthetic-private");
  });
});

describe("catalog question response", () => {
  it("uses one interpretation and stored facts, with in-memory audit only", async () => {
    const dependencies = setup();
    const result = await answerCatalogQuestion(
      "What is the price and availability of the canvas tote?",
      dependencies,
    );
    expect(result.decision.kind).toBe("reply");
    if (result.decision.kind !== "reply") throw new Error("Expected reply");
    expect(result.decision.text).toContain("PKR 1,800.00");
    expect(result.decision.text).toContain("unavailable");
    expect(result.decision.text).toContain(product.description);
    expect(dependencies.interpreter.interpret).toHaveBeenCalledTimes(1);
    expect(result.audit.map((entry) => entry.details.operation)).toEqual(["interpret", "search"]);
    expect(JSON.stringify(result.audit)).not.toContain("What is the price");
    expect(result.audit[0]?.details).not.toHaveProperty("query");
  });
  it("prints an unsupported decision without provider or catalog writes", async () => {
    const dependencies = setup();
    dependencies.interpreter.interpret.mockResolvedValue({
      kind: "handoff",
      query: null,
      topic: null,
    });
    const result = await answerCatalogQuestion("I need a refund", dependencies);
    expect(result.decision.kind).toBe("handoff");
    expect(dependencies.catalog.searchCatalog).not.toHaveBeenCalled();
  });
  it("retains the responder's mention guard", async () => {
    const dependencies = setup();
    const result = await answerCatalogQuestion("How much is a mug?", dependencies);
    expect(result.decision).toMatchObject({
      kind: "reply",
      text: expect.stringContaining("Which product"),
    });
    expect(dependencies.catalog.searchCatalog).not.toHaveBeenCalled();
  });
  it("bypasses interpretation for existing catalog commands", async () => {
    const dependencies = setup();
    const result = await answerCatalogQuestion("/catalog canvas tote", dependencies);
    expect(result.decision.kind).toBe("reply");
    expect(dependencies.interpreter.interpret).not.toHaveBeenCalled();
  });
  it.each(["", "a".repeat(2001), "tote\0"])(
    "rejects invalid questions before any adapter call",
    async (question) => {
      const dependencies = setup();
      await expect(answerCatalogQuestion(question, dependencies)).rejects.toThrow();
      expect(dependencies.interpreter.interpret).not.toHaveBeenCalled();
      expect(dependencies.catalog.searchCatalog).not.toHaveBeenCalled();
    },
  );
  it("propagates model failure without searching or fabricating a reply", async () => {
    const dependencies = setup();
    dependencies.interpreter.interpret.mockRejectedValue(new Error("synthetic failure"));
    await expect(answerCatalogQuestion("Price of canvas tote?", dependencies)).rejects.toThrow(
      "synthetic failure",
    );
    expect(dependencies.catalog.searchCatalog).not.toHaveBeenCalled();
  });
});
