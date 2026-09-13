import { createDatabase, PostgresCatalog } from "@replywork/adapters";

import { parseCatalogArguments } from "./catalog-command.js";
import { loadCatalogConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";

loadLocalEnvironment();
const query = parseCatalogArguments(process.argv.slice(2));
const config = loadCatalogConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  const items = await new PostgresCatalog(database.sql).searchCatalog(query);
  process.stdout.write(
    `${JSON.stringify({ status: items.length === 0 ? "not-found" : "found", items }, null, 2)}\n`,
  );
} finally {
  await database.close();
}
