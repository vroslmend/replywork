import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, PostgresCatalog } from "@replywork/adapters";
import type { CatalogInterpreter } from "@replywork/core";

import { requireLocalCatalogDatabase } from "../src/catalog-command.js";
import { answerCatalogQuestion } from "../src/catalog-question.js";

const databaseUrl =
  process.env.REPLYWORK_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
requireLocalCatalogDatabase(databaseUrl);
const database = createDatabase(databaseUrl);
const productId = `catalog-question-${process.pid}-${Date.now()}`;
const catalog = new PostgresCatalog(database.sql);

beforeAll(async () => {
  await database.sql`
    INSERT INTO replywork.catalog_items (id,name,description,currency,price_minor,available,approved)
    VALUES (${productId},${productId},'Synthetic question fixture.','PKR',45000,false,true),
           (${productId + "-private"},${productId},'Unapproved fixture.','PKR',1,true,false)
  `;
});
afterAll(async () => {
  try {
    await database.sql`DELETE FROM replywork.catalog_items WHERE id IN (${productId},${productId + "-private"})`;
  } finally {
    await database.close();
  }
});

describe("catalog question with real PostgreSQL", () => {
  it("renders approved stored facts without changing catalog or persisting its audit", async () => {
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "search", query: productId, topic: "details" }),
    };
    const result = await answerCatalogQuestion(
      `What is the price and availability of ${productId}?`,
      { catalog, interpreter },
    );
    expect(result.decision.kind).toBe("reply");
    if (result.decision.kind !== "reply") throw new Error("Expected reply");
    expect(result.decision.text).toContain("PKR 450.00");
    expect(result.decision.text).toContain("unavailable");
    expect(result.decision.text).toContain("Synthetic question fixture.");
    expect(result.decision.text).not.toContain("Unapproved fixture");
    expect(result.audit.at(-1)?.details.resultCount).toBe(1);
    const rows =
      await database.sql`SELECT price_minor,available,approved FROM replywork.catalog_items WHERE id=${productId}`;
    expect(rows[0]).toMatchObject({ price_minor: 45000, available: false, approved: true });
    const audit =
      await database.sql`SELECT id FROM replywork.audit_entries WHERE delivery_key='local:catalog-question'`;
    expect(audit).toHaveLength(0);
  });
  it("hands off without looking up products", async () => {
    const interpreter = {
      interpret: vi
        .fn<CatalogInterpreter["interpret"]>()
        .mockResolvedValue({ kind: "handoff", query: null, topic: null }),
    };
    const search = vi.spyOn(catalog, "searchCatalog");
    const result = await answerCatalogQuestion("I need a refund", { catalog, interpreter });
    expect(result.decision.kind).toBe("handoff");
    expect(search).not.toHaveBeenCalled();
  });
});
