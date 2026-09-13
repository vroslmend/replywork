import { catalogRequestSchema, type CatalogRequest } from "@replywork/contracts";
import type { CatalogInterpreter } from "@replywork/core";
import { z } from "zod";

const casesSchema = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[a-z][a-z0-9-]*$/),
      message: z
        .string()
        .trim()
        .min(1)
        .max(2_000)
        .refine((text) => !text.includes("\0")),
      expected: catalogRequestSchema,
    }),
  )
  .min(1)
  .max(30)
  .refine(
    (cases) => new Set(cases.map(({ id }) => id)).size === cases.length,
    "Case IDs must be unique",
  );

export type CatalogEvaluationCase = z.infer<typeof casesSchema>[number];

export const parseCatalogEvaluationCases = (input: unknown): CatalogEvaluationCase[] =>
  casesSchema.parse(input);

export interface CatalogEvaluationCommand {
  run: boolean;
  caseId?: string;
}

export const parseCatalogEvaluationArguments = (
  arguments_: readonly string[],
): CatalogEvaluationCommand => {
  const command: CatalogEvaluationCommand = { run: false };
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--run" && !command.run) {
      command.run = true;
    } else if (
      argument === "--case" &&
      command.caseId === undefined &&
      arguments_[index + 1] !== undefined &&
      /^[a-z][a-z0-9-]*$/.test(arguments_[index + 1]!)
    ) {
      command.caseId = arguments_[++index]!;
    } else {
      throw new Error("Usage: pnpm catalog:eval [--run] [--case <case-id>]");
    }
  }
  return command;
};

export const selectCatalogEvaluationCases = (
  cases: readonly CatalogEvaluationCase[],
  caseId?: string,
): readonly CatalogEvaluationCase[] => {
  if (caseId === undefined) return cases;
  const selected = cases.find(({ id }) => id === caseId);
  if (selected === undefined) throw new Error("Unknown catalog evaluation case");
  return [selected];
};

export interface CatalogEvaluationResult {
  id: string;
  status: "passed" | "mismatch" | "error";
  expected: CatalogRequest;
  actual: CatalogRequest | null;
  durationMs: number;
}

const normalizeQuery = (text: string | null): string | null =>
  text === null ? null : text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export const runCatalogEvaluation = async (
  input: readonly CatalogEvaluationCase[],
  dependencies: {
    interpreter: CatalogInterpreter;
    now?: () => number;
    onResult?: (result: CatalogEvaluationResult) => void;
  },
) => {
  const cases = parseCatalogEvaluationCases(input);
  const results: CatalogEvaluationResult[] = [];
  const now = dependencies.now ?? (() => performance.now());
  for (const testCase of cases) {
    const startedAt = now();
    let actual: CatalogRequest | null = null;
    let status: CatalogEvaluationResult["status"];
    try {
      actual = catalogRequestSchema.parse(
        await dependencies.interpreter.interpret(testCase.message),
      );
      status =
        actual.kind === testCase.expected.kind &&
        actual.topic === testCase.expected.topic &&
        normalizeQuery(actual.query) === normalizeQuery(testCase.expected.query)
          ? "passed"
          : "mismatch";
    } catch {
      // Provider errors can contain request headers. Reports deliberately omit raw errors.
      status = "error";
    }
    const result = {
      id: testCase.id,
      status,
      actual,
      expected: testCase.expected,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
    };
    results.push(result);
    dependencies.onResult?.(result);
    if (status === "error") break;
  }
  return {
    total: cases.length,
    completed: results.length,
    passed: results.filter(({ status }) => status === "passed").length,
    mismatched: results.filter(({ status }) => status === "mismatch").length,
    errors: results.filter(({ status }) => status === "error").length,
    notRun: cases.length - results.length,
    results,
  };
};
