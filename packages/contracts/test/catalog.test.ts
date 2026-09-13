import { describe, expect, it } from "vitest";

import { catalogItemSchema, catalogQuerySchema } from "@replywork/contracts";

describe("catalog contracts", () => {
  it("trims a bounded query", () => {
    expect(catalogQuerySchema.parse({ limit: 5, text: "  Canvas tote  " })).toEqual({
      limit: 5,
      text: "Canvas tote",
    });
  });

  it.each([
    { limit: 5, text: " " },
    { limit: 5, text: "a".repeat(201) },
    { limit: 5, text: "a\0b" },
    { limit: 0, text: "canvas" },
    { limit: 21, text: "canvas" },
    { limit: 1.5, text: "canvas" },
  ])("rejects invalid query %j", (query) => {
    expect(() => catalogQuerySchema.parse(query)).toThrow();
  });

  const item = {
    available: false,
    currency: "PKR",
    description: "Synthetic cotton bag.",
    id: "test-tote",
    name: "Canvas tote",
    priceMinor: 180000,
  };

  it("preserves minor-unit prices and explicit unavailability", () => {
    expect(catalogItemSchema.parse(item)).toEqual(item);
  });

  it.each([
    { priceMinor: -1 },
    { priceMinor: 1.5 },
    { priceMinor: 2_147_483_648 },
    { currency: "pkr" },
    { currency: "PK" },
    { available: "yes" },
    { description: "" },
  ])("rejects invalid catalog data %j", (invalid) => {
    expect(() => catalogItemSchema.parse({ ...item, ...invalid })).toThrow();
  });
});
