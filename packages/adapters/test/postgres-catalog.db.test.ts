import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, PostgresCatalog } from "@replywork/adapters";

const databaseUrl =
  process.env.REPLYWORK_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.search !== "") {
  throw new Error("Catalog database tests require a local PostgreSQL URL without query parameters");
}

const prefix = `catalog-test-${process.pid}-${Date.now()}`;
const ids = [`${prefix}-a`, `${prefix}-b`, `${prefix}-z`, `${prefix}-hidden`];
const database = createDatabase(databaseUrl);
const catalog = new PostgresCatalog(database.sql);

beforeAll(async () => {
  await database.sql`
    INSERT INTO replywork.catalog_items
      (id, name, description, currency, price_minor, available, approved)
    VALUES
      (${ids[0]!}, ${`${prefix} Alpha tote`}, ${`${prefix}-z cotton bag; 100%_%`}, 'PKR', 180000, true, true),
      (${ids[1]!}, ${`${prefix} Beta mug`}, 'Synthetic ceramic mug.', 'PKR', 120000, false, true),
      (${ids[2]!}, ${`${prefix} Zeta notebook`}, 'Synthetic plain notebook.', 'PKR', 45000, true, true),
      (${ids[3]!}, ${`${prefix} Hidden item`}, 'Synthetic unapproved item.', 'PKR', 1, true, false)
  `;
});

afterAll(async () => {
  try {
    await database.sql`DELETE FROM replywork.catalog_items WHERE id IN ${database.sql(ids)}`;
  } finally {
    await database.close();
  }
});

describe("PostgresCatalog", () => {
  it("returns approved records with stored facts using case-insensitive name search", async () => {
    expect(
      await catalog.searchCatalog({ limit: 5, text: `  ${prefix.toUpperCase()} ALPHA  ` }),
    ).toEqual([
      {
        available: true,
        currency: "PKR",
        description: `${prefix}-z cotton bag; 100%_%`,
        id: ids[0],
        name: `${prefix} Alpha tote`,
        priceMinor: 180000,
      },
    ]);
  });

  it("searches descriptions and prioritizes an exact product ID", async () => {
    const items = await catalog.searchCatalog({ limit: 5, text: ids[2]! });
    expect(items.map((item) => item.id)).toEqual([ids[2], ids[0]]);
  });

  it("bounds results in a stable order and excludes unapproved records", async () => {
    expect(
      (await catalog.searchCatalog({ limit: 2, text: prefix })).map((item) => item.id),
    ).toEqual([ids[0], ids[1]]);
    expect(
      (await catalog.searchCatalog({ limit: 20, text: prefix })).map((item) => item.id),
    ).toEqual([ids[0], ids[1], ids[2]]);
    expect(await catalog.searchCatalog({ limit: 5, text: ids[3]! })).toEqual([]);
  });

  it("returns an unavailable product without claiming it is in stock", async () => {
    const [item] = await catalog.searchCatalog({ limit: 1, text: ids[1]! });
    expect(item?.available).toBe(false);
    expect(item?.priceMinor).toBe(120000);
  });

  it("treats wildcard and SQL syntax as literal input", async () => {
    expect(
      (await catalog.searchCatalog({ limit: 5, text: "100%_%" })).map((item) => item.id),
    ).toContain(ids[0]);
    expect(await catalog.searchCatalog({ limit: 5, text: `${prefix}' OR true --` })).toEqual([]);
  });

  it("returns no matches rather than substituting another product", async () => {
    expect(await catalog.searchCatalog({ limit: 5, text: `${prefix}-missing` })).toEqual([]);
  });

  it("validates query boundaries before executing a lookup", async () => {
    await expect(catalog.searchCatalog({ limit: 100, text: prefix })).rejects.toThrow();
    await expect(catalog.searchCatalog({ limit: 5, text: " " })).rejects.toThrow();
  });

  it("rejects invalid stored prices and currency codes", async () => {
    await expect(database.sql`
      INSERT INTO replywork.catalog_items (id, name, description, currency, price_minor, available)
      VALUES (${`${prefix}-invalid-price`}, 'Synthetic item', 'Synthetic description', 'PKR', -1, true)
    `).rejects.toMatchObject({ code: "23514" });
    await expect(database.sql`
      INSERT INTO replywork.catalog_items (id, name, description, currency, price_minor, available)
      VALUES (${`${prefix}-invalid-currency`}, 'Synthetic item', 'Synthetic description', 'pkr', 1, true)
    `).rejects.toMatchObject({ code: "23514" });
  });
});
