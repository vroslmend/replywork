import { parseArgs } from "node:util";

import { catalogQuerySchema, type CatalogQuery } from "@replywork/contracts";

export const parseCatalogArguments = (args: readonly string[]): CatalogQuery => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: [...args],
    options: { limit: { default: "5", type: "string" } },
    strict: true,
  });

  if (!/^\d+$/.test(values.limit)) {
    throw new Error("--limit must be an integer from 1 to 20");
  }

  return catalogQuerySchema.parse({ limit: Number(values.limit), text: positionals.join(" ") });
};

export const requireLocalCatalogDatabase = (databaseUrl: string): void => {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.search !== "") {
    throw new Error("This catalog command requires a local database URL without query parameters");
  }
};
