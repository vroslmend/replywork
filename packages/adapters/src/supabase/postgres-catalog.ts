import {
  catalogItemSchema,
  catalogQuerySchema,
  type CatalogItem,
  type CatalogQuery,
} from "@replywork/contracts";
import type { CatalogCapability } from "@replywork/core";
import type postgres from "postgres";

export class PostgresCatalog implements CatalogCapability {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  async searchCatalog(input: CatalogQuery): Promise<readonly CatalogItem[]> {
    const query = catalogQuerySchema.parse(input);
    const rows = await this.#sql`
      SELECT id, name, description, currency, price_minor AS "priceMinor", available
      FROM replywork.catalog_items
      WHERE approved = true
        AND (
          id = ${query.text}
          OR strpos(lower(name), lower(${query.text})) > 0
          OR strpos(lower(description), lower(${query.text})) > 0
        )
      ORDER BY (id = ${query.text}) DESC, lower(name), id
      LIMIT ${query.limit}
    `;

    return catalogItemSchema.array().parse(rows);
  }
}
