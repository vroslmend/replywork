import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { CatalogInterpreter } from "@replywork/core";

import {
  parseCatalogEvaluationArguments,
  parseCatalogEvaluationCases,
  runCatalogEvaluation,
  selectCatalogEvaluationCases,
  type CatalogEvaluationCase,
} from "../src/catalog-evaluation.js";
import { loadCatalogEvaluationConfig } from "../src/config.js";

const cases: CatalogEvaluationCase[] = [
  {
    id: "price",
    message: "Price of canvas tote?",
    expected: { kind: "search", query: "canvas tote", topic: "price" },
  },
  { id: "greeting", message: "Hello", expected: { kind: "clarify", query: null, topic: null } },
  {
    id: "order",
    message: "Track my order",
    expected: { kind: "handoff", query: null, topic: null },
  },
];

describe("catalog evaluation command", () => {
  it("previews through the real CLI without model configuration", () => {
    const result = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        "apps/service/src/catalog-evaluation-main.ts",
        "--case",
        "product-price",
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: { ...process.env, GOOGLE_GENERATIVE_AI_API_KEY: "", REPLYWORK_CATALOG_MODEL: "" },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      mode: "preview",
      maxModelCalls: 1,
      cases: [{ id: "product-price" }],
    });
  });
  it("defaults to preview and supports selecting one case with explicit live opt-in", () => {
    expect(parseCatalogEvaluationArguments([])).toEqual({ run: false });
    expect(parseCatalogEvaluationArguments(["--case", "price"])).toEqual({
      run: false,
      caseId: "price",
    });
    expect(parseCatalogEvaluationArguments(["--run", "--case", "price"])).toEqual({
      run: true,
      caseId: "price",
    });
    expect(parseCatalogEvaluationArguments(["--case", "price", "--run"])).toEqual({
      run: true,
      caseId: "price",
    });
    expect(selectCatalogEvaluationCases(cases, "price")).toEqual([cases[0]]);
    expect(() => selectCatalogEvaluationCases(cases, "missing")).toThrow("Unknown");
  });

  it.each(
    [
      ["--run", "--run"],
      ["--case"],
      ["--case", "--run"],
      ["--case", "price", "--case", "order"],
      ["--limit", "100"],
      ["anything"],
    ].map((arguments_) => ({ arguments_ })),
  )("rejects unsupported arguments $arguments_", ({ arguments_ }) => {
    expect(() => parseCatalogEvaluationArguments(arguments_)).toThrow("Usage");
  });

  it("requires only model configuration, not database or Chatwoot credentials", () => {
    expect(
      loadCatalogEvaluationConfig({
        GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key",
        REPLYWORK_CATALOG_MODEL: "synthetic-model",
      }),
    ).toEqual({
      GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-key",
      REPLYWORK_CATALOG_MODEL: "synthetic-model",
    });
    expect(() => loadCatalogEvaluationConfig({})).toThrow();
  });

  it("validates the canonical synthetic dataset and its expected search mentions", () => {
    const dataset = parseCatalogEvaluationCases(
      JSON.parse(
        readFileSync(new URL("../../../evals/catalog/questions.json", import.meta.url), "utf8"),
      ),
    );
    expect(dataset).toHaveLength(24);
    expect(new Set(dataset.map(({ expected }) => expected.kind))).toEqual(
      new Set(["search", "clarify", "handoff"]),
    );
    for (const testCase of dataset) {
      if (testCase.expected.query !== null)
        expect(testCase.message.toLowerCase()).toContain(testCase.expected.query.toLowerCase());
    }
  });

  it.each(
    [
      [],
      [cases[0], cases[0]],
      Array.from({ length: 31 }, (_, index) => ({ ...cases[0], id: `case-${index}` })),
      [{ ...cases[0], message: "a".repeat(2001) }],
      [{ ...cases[0], expected: { kind: "search", query: null, topic: "price" } }],
    ].map((input) => ({ input })),
  )("rejects invalid datasets before a model call", async ({ input }) => {
    const interpreter = { interpret: vi.fn<CatalogInterpreter["interpret"]>() };
    await expect(
      runCatalogEvaluation(input as CatalogEvaluationCase[], { interpreter }),
    ).rejects.toThrow();
    expect(interpreter.interpret).not.toHaveBeenCalled();
  });
});

describe("catalog evaluation scoring", () => {
  it("scores normalized query, kind and topic and reports bounded timings", async () => {
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValueOnce({ kind: "search", query: "CANVAS   TOTE", topic: "price" })
        .mockResolvedValueOnce(cases[1]!.expected)
        .mockResolvedValueOnce(cases[2]!.expected),
    };
    let time = 0;
    const onResult = vi.fn();
    const report = await runCatalogEvaluation(cases, {
      interpreter,
      now: () => (time += 25),
      onResult,
    });
    expect(report).toMatchObject({
      total: 3,
      completed: 3,
      passed: 3,
      mismatched: 0,
      errors: 0,
      notRun: 0,
    });
    expect(report.results.every(({ durationMs }) => durationMs === 25)).toBe(true);
    expect(interpreter.interpret.mock.calls.map(([text]) => text)).toEqual(
      cases.map(({ message }) => message),
    );
    expect(onResult).toHaveBeenCalledTimes(3);
  });

  it.each([
    { kind: "search", query: "tote", topic: "price" },
    { kind: "search", query: "canvas tote", topic: "availability" },
    { kind: "handoff", query: null, topic: null },
  ] as const)(
    "reports a semantic mismatch rather than accepting any valid output",
    async (actual) => {
      const interpreter = {
        interpret: vi.fn<CatalogInterpreter["interpret"]>().mockResolvedValue(actual),
      };
      const report = await runCatalogEvaluation([cases[0]!], { interpreter });
      expect(report).toMatchObject({ passed: 0, mismatched: 1, errors: 0 });
      expect(report.results[0]).toMatchObject({ status: "mismatch", actual });
    },
  );

  it("continues after mismatches so the run provides useful case coverage", async () => {
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValueOnce(cases[2]!.expected)
        .mockResolvedValueOnce(cases[1]!.expected)
        .mockResolvedValueOnce(cases[2]!.expected),
    };
    expect(await runCatalogEvaluation(cases, { interpreter })).toMatchObject({
      completed: 3,
      passed: 2,
      mismatched: 1,
      notRun: 0,
    });
  });

  it("stops on provider failure, counts unfinished cases and never reports raw errors", async () => {
    const secret = "synthetic-secret-must-not-appear";
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValueOnce(cases[0]!.expected)
        .mockRejectedValueOnce(new Error(`Request headers: ${secret}`)),
    };
    const report = await runCatalogEvaluation(cases, { interpreter });
    expect(report).toMatchObject({ completed: 2, passed: 1, errors: 1, notRun: 1 });
    expect(interpreter.interpret).toHaveBeenCalledTimes(2);
    expect(report.results[1]).toMatchObject({ status: "error", actual: null });
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("treats invalid output as an error and stops rather than scoring it", async () => {
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "search", query: null, topic: "price" }),
    };
    expect(await runCatalogEvaluation(cases, { interpreter })).toMatchObject({
      completed: 1,
      errors: 1,
      notRun: 2,
    });
    expect(interpreter.interpret).toHaveBeenCalledTimes(1);
  });

  it("reports only a bounded HTTP status, not provider messages or headers", async () => {
    const interpreter = {
      interpret: vi.fn<CatalogInterpreter["interpret"]>().mockRejectedValue({
        statusCode: 429,
        message: "synthetic-private-provider-message",
        responseHeaders: { authorization: "synthetic-private-header" },
      }),
    };
    const report = await runCatalogEvaluation(cases, { interpreter });
    expect(report.results[0]).toMatchObject({ status: "error", errorHttpStatus: 429 });
    expect(report.notRun).toBe(2);
    expect(JSON.stringify(report)).not.toContain("synthetic-private");
  });

  it.each(["429", -1, 600, 429.5])("omits invalid HTTP status %s", async (statusCode) => {
    const interpreter = {
      interpret: vi.fn<CatalogInterpreter["interpret"]>().mockRejectedValue({ statusCode }),
    };
    const report = await runCatalogEvaluation(cases, { interpreter });
    expect(report.results[0]).not.toHaveProperty("errorHttpStatus");
  });

  it("spaces subsequent calls without delaying the first one", async () => {
    vi.useFakeTimers();
    try {
      const interpreter = {
        interpret: vi.fn<CatalogInterpreter["interpret"]>().mockResolvedValue(cases[0]!.expected),
      };
      const pending = runCatalogEvaluation(cases.slice(0, 2), { interpreter, intervalMs: 5000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(interpreter.interpret).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4999);
      expect(interpreter.interpret).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(interpreter.interpret).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([-1, 60_001, 1.5])(
    "rejects an invalid interval before model calls: %s",
    async (intervalMs) => {
      const interpreter = { interpret: vi.fn<CatalogInterpreter["interpret"]>() };
      await expect(runCatalogEvaluation(cases, { interpreter, intervalMs })).rejects.toThrow();
      expect(interpreter.interpret).not.toHaveBeenCalled();
    },
  );
});
