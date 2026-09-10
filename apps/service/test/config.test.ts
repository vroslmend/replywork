import { describe, expect, it } from "vitest";

import { loadServiceConfig, loadWorkerConfig } from "../src/config.js";

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

describe("loadWorkerConfig", () => {
  it("parses the controlled worker configuration", () => {
    expect(
      loadWorkerConfig({
        CHATWOOT_ACCOUNT_ID: "7",
        CHATWOOT_API_ACCESS_TOKEN: "token",
        CHATWOOT_BASE_URL: "https://chat.example.com",
        CHATWOOT_HANDOFF_TEAM_ID: "",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        REPLYWORK_REPLY_TEXT: "Thanks for your message.",
        WORKER_VISIBILITY_TIMEOUT_SECONDS: "45",
      }),
    ).toEqual({
      CHATWOOT_ACCOUNT_ID: 7,
      CHATWOOT_API_ACCESS_TOKEN: "token",
      CHATWOOT_BASE_URL: "https://chat.example.com",
      CHATWOOT_HANDOFF_TEAM_ID: undefined,
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      REPLYWORK_REPLY_TEXT: "Thanks for your message.",
      WORKER_VISIBILITY_TIMEOUT_SECONDS: 45,
    });
  });

  it("rejects a worker without Chatwoot credentials or reply text", () => {
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
    ).toThrow();
  });
});
