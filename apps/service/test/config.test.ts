import { describe, expect, it } from "vitest";

import { loadServiceConfig } from "../src/config.js";

describe("loadServiceConfig", () => {
  it("parses valid startup configuration", () => {
    expect(
      loadServiceConfig({
        CHATWOOT_WEBHOOK_SECRET: "secret",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        NODE_ENV: "test",
        PORT: "3100",
      }),
    ).toEqual({
      CHATWOOT_WEBHOOK_SECRET: "secret",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      NODE_ENV: "test",
      PORT: 3100,
    });
  });

  it("rejects missing credentials", () => {
    expect(() => loadServiceConfig({})).toThrow();
  });
});
