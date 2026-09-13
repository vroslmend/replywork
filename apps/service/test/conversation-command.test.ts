import { describe, expect, it } from "vitest";

import { loadConversationControlConfig } from "../src/config.js";
import { parseConversationArguments } from "../src/conversation-command.js";

describe("conversation control command", () => {
  it.each(["status", "pause", "resume"])("accepts %s for a positive conversation ID", (action) => {
    expect(parseConversationArguments([action, "19"])).toEqual({ action, conversationId: "19" });
  });
  it.each(
    [
      [],
      ["resume"],
      ["other", "19"],
      ["pause", "0"],
      ["pause", "-1"],
      ["pause", "1.5"],
      ["pause", "19", "extra"],
    ].map((arguments_) => ({ arguments_ })),
  )("rejects malformed arguments $arguments_", ({ arguments_ }) => {
    expect(() => parseConversationArguments(arguments_)).toThrow("Usage:");
  });
  it("needs only database access and an account scope, not provider credentials", () => {
    expect(
      loadConversationControlConfig({
        DATABASE_URL: "postgresql://localhost/postgres",
        CHATWOOT_ACCOUNT_ID: "7",
      }),
    ).toEqual({ DATABASE_URL: "postgresql://localhost/postgres", CHATWOOT_ACCOUNT_ID: 7 });
    expect(() =>
      loadConversationControlConfig({
        DATABASE_URL: "https://example.com",
        CHATWOOT_ACCOUNT_ID: "7",
      }),
    ).toThrow();
    expect(() =>
      loadConversationControlConfig({ DATABASE_URL: "postgresql://localhost/postgres" }),
    ).toThrow();
  });
});
