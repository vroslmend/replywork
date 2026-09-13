import { describe, expect, it } from "vitest";

import { parseCatalogArguments, requireLocalSeedDatabase } from "../src/catalog-command.js";
import { loadCatalogConfig } from "../src/config.js";

describe("catalog command", () => {
  it("joins positional words with a default limit", () => {
    expect(parseCatalogArguments(["canvas", "tote"])).toEqual({ limit: 5, text: "canvas tote" });
  });

  it("accepts an explicit limit", () => {
    expect(parseCatalogArguments(["--limit", "2", "canvas"])).toEqual({ limit: 2, text: "canvas" });
  });

  it("accepts the argument separator", () => {
    expect(parseCatalogArguments(["--", "canvas tote"])).toEqual({ limit: 5, text: "canvas tote" });
  });

  it.each(
    [
      [],
      [" "],
      ["--limit", "0", "canvas"],
      ["--limit", "21", "canvas"],
      ["--limit", "1.5", "canvas"],
      ["--unknown", "canvas"],
    ].map((args) => ({ args })),
  )("rejects invalid arguments $args", ({ args }) => {
    expect(() => parseCatalogArguments(args)).toThrow();
  });

  it("needs only a PostgreSQL connection, not Chatwoot credentials", () => {
    expect(loadCatalogConfig({ DATABASE_URL: "postgresql://localhost/replywork" })).toEqual({
      DATABASE_URL: "postgresql://localhost/replywork",
    });
    expect(() => loadCatalogConfig({})).toThrow();
    expect(() => loadCatalogConfig({ DATABASE_URL: "https://example.com" })).toThrow();
  });

  it.each([
    "postgresql://localhost/replywork",
    "postgres://127.0.0.1:54322/postgres",
    "postgresql://[::1]/replywork",
  ])("allows a local example seed at %s", (url) => {
    expect(() => requireLocalSeedDatabase(url)).not.toThrow();
  });

  it.each([
    "postgresql://db.example.com/replywork",
    "postgresql://localhost/replywork?host=db.example.com",
  ])("rejects example seeding at %s", (url) => {
    expect(() => requireLocalSeedDatabase(url)).toThrow();
  });
});
