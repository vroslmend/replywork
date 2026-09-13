import { readFileSync } from "node:fs";

import { createGoogleCatalogInterpreter } from "@replywork/adapters";

import {
  parseCatalogEvaluationArguments,
  parseCatalogEvaluationCases,
  runCatalogEvaluation,
  selectCatalogEvaluationCases,
} from "./catalog-evaluation.js";
import { loadCatalogEvaluationConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";

const main = async (): Promise<void> => {
  const command = parseCatalogEvaluationArguments(process.argv.slice(2));
  const cases = selectCatalogEvaluationCases(
    parseCatalogEvaluationCases(
      JSON.parse(
        readFileSync(new URL("../../../evals/catalog/questions.json", import.meta.url), "utf8"),
      ),
    ),
    command.caseId,
  );
  if (!command.run) {
    process.stdout.write(
      `${JSON.stringify({ mode: "preview", maxModelCalls: cases.length, cases }, null, 2)}\n`,
    );
    return;
  }
  loadLocalEnvironment();
  const config = loadCatalogEvaluationConfig(process.env);
  const report = await runCatalogEvaluation(cases, {
    intervalMs: 5_000,
    interpreter: createGoogleCatalogInterpreter({
      apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
      modelId: config.REPLYWORK_CATALOG_MODEL,
    }),
    onResult: ({ id, status, errorHttpStatus }) =>
      process.stderr.write(
        `${id}: ${status}${errorHttpStatus === undefined ? "" : ` (HTTP ${errorHttpStatus})`}\n`,
      ),
  });
  process.stdout.write(
    `${JSON.stringify({ mode: "live", modelId: config.REPLYWORK_CATALOG_MODEL, completedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
  );
  if (report.passed !== report.total) process.exitCode = 1;
};

main().catch(() => {
  process.stderr.write(
    "Catalog evaluation could not run. Use catalog:eval [--run] [--case <case-id>] with a valid dataset; live runs require GOOGLE_GENERATIVE_AI_API_KEY and REPLYWORK_CATALOG_MODEL.\n",
  );
  process.exitCode = 1;
});
