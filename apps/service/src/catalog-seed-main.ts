import { readFile } from "node:fs/promises";

import { createDatabase } from "@replywork/adapters";

import { requireLocalSeedDatabase } from "./catalog-command.js";
import { loadCatalogConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";

loadLocalEnvironment();
const config = loadCatalogConfig(process.env);
requireLocalSeedDatabase(config.DATABASE_URL);
const seed = await readFile(
  new URL("../../../supabase/seeds/catalog.example.sql", import.meta.url),
  "utf8",
);
const database = createDatabase(config.DATABASE_URL);

try {
  const rows = await database.sql.unsafe(seed);
  process.stdout.write(
    `Inserted ${rows.count} synthetic catalog items. Existing items were not changed.\n`,
  );
} finally {
  await database.close();
}
