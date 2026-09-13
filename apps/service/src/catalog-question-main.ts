import {
  createDatabase,
  createGoogleCatalogInterpreter,
  PostgresCatalog,
} from "@replywork/adapters";

import { requireLocalCatalogDatabase } from "./catalog-command.js";
import { answerCatalogQuestion, parseCatalogQuestionArguments } from "./catalog-question.js";
import { loadCatalogQuestionConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";

const main = async (): Promise<void> => {
  const command = parseCatalogQuestionArguments(process.argv.slice(2));
  if (!command.run) {
    process.stdout.write(
      `${JSON.stringify({ mode: "preview", maxModelCalls: 1, question: command.question }, null, 2)}\n`,
    );
    return;
  }
  loadLocalEnvironment();
  const config = loadCatalogQuestionConfig(process.env);
  requireLocalCatalogDatabase(config.DATABASE_URL);
  const database = createDatabase(config.DATABASE_URL);
  try {
    // Verify the required table before spending a model call. Never seed or write here.
    await database.sql`SELECT id FROM replywork.catalog_items LIMIT 0`;
    const result = await answerCatalogQuestion(command.question, {
      catalog: new PostgresCatalog(database.sql),
      interpreter: createGoogleCatalogInterpreter({
        apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
        modelId: config.REPLYWORK_CATALOG_MODEL,
      }),
    });
    process.stdout.write(
      `${JSON.stringify({ mode: "live", modelId: config.REPLYWORK_CATALOG_MODEL, ...result }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
};

main().catch(() => {
  process.stderr.write(
    'Catalog question failed. Use catalog:ask [--run] "question"; live runs require Google key/model settings and a reachable local DATABASE_URL with the catalog migration applied.\n',
  );
  process.exitCode = 1;
});
