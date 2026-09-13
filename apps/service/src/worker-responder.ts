import {
  CatalogResponder,
  type AuditStore,
  type CatalogCapability,
  type ConversationResponder,
} from "@replywork/core";

import type { WorkerConfig } from "./config.js";

export const createWorkerResponder = (
  config: WorkerConfig,
  dependencies: { auditStore: AuditStore; catalog: CatalogCapability },
): ConversationResponder => {
  const responder: ConversationResponder =
    config.REPLYWORK_RESPONDER === "catalog"
      ? new CatalogResponder(dependencies)
      : { decide: async () => ({ kind: "reply", text: config.REPLYWORK_REPLY_TEXT }) };

  return {
    decide: async (event) => {
      if (event.accountId !== String(config.CHATWOOT_ACCOUNT_ID)) {
        throw new Error("Delivery account does not match the configured Chatwoot account");
      }
      return responder.decide(event);
    },
  };
};
