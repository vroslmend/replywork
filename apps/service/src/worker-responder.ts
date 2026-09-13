import {
  CatalogResponder,
  type AuditStore,
  type CatalogCapability,
  type CatalogInterpreter,
  type ConversationResponder,
} from "@replywork/core";

import type { WorkerConfig } from "./config.js";

export const createWorkerResponder = (
  config: WorkerConfig,
  dependencies: {
    auditStore: AuditStore;
    catalog: CatalogCapability;
    interpreter?: CatalogInterpreter;
  },
): ConversationResponder => {
  const responder: ConversationResponder =
    config.REPLYWORK_RESPONDER !== "fixed"
      ? new CatalogResponder({
          auditStore: dependencies.auditStore,
          catalog: dependencies.catalog,
          ...(config.REPLYWORK_RESPONDER === "catalog-natural"
            ? { interpreter: requireInterpreter(dependencies.interpreter) }
            : {}),
        })
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

const requireInterpreter = (interpreter: CatalogInterpreter | undefined): CatalogInterpreter => {
  if (interpreter === undefined) throw new Error("Natural catalog mode requires an interpreter");
  return interpreter;
};
