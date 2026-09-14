import {
  createGoogleCatalogInterpreter,
  ChatwootConversationProvider,
  CrispConversationProvider,
  createDatabase,
  PgmqDeliveryQueue,
  PostgresAuditStore,
  PostgresCatalog,
  PostgresConversationAutomation,
} from "@replywork/adapters";
import type { ConversationProvider } from "@replywork/core";

import { type WorkerConfig, workerAccountId } from "./config.js";
import { runWorkerOnce, type WorkerRunResult } from "./worker.js";
import { createWorkerResponder } from "./worker-responder.js";

const createConversationProvider = (config: WorkerConfig): ConversationProvider =>
  config.REPLYWORK_PROVIDER === "crisp"
    ? new CrispConversationProvider({
        apiBaseUrl: config.CRISP_API_BASE_URL,
        tokenIdentifier: config.CRISP_PLUGIN_TOKEN_IDENTIFIER,
        tokenKey: config.CRISP_PLUGIN_TOKEN_KEY,
        websiteId: config.CRISP_WEBSITE_ID,
      })
    : new ChatwootConversationProvider({
        accountId: config.CHATWOOT_ACCOUNT_ID,
        accessToken: config.CHATWOOT_API_ACCESS_TOKEN,
        baseUrl: config.CHATWOOT_BASE_URL,
        ...(config.CHATWOOT_HANDOFF_TEAM_ID === undefined
          ? {}
          : { handoffTeamId: config.CHATWOOT_HANDOFF_TEAM_ID }),
      });

export const runConfiguredWorkerOnce = async (config: WorkerConfig): Promise<WorkerRunResult> => {
  const database = createDatabase(config.DATABASE_URL);
  const auditStore = new PostgresAuditStore(database.sql);

  try {
    return await runWorkerOnce(
      {
        accountId: workerAccountId(config),
        auditStore,
        conversationAutomation: new PostgresConversationAutomation(database.sql),
        conversationProvider: createConversationProvider(config),
        deliveryQueue: new PgmqDeliveryQueue(database.sql),
        responder: createWorkerResponder(config, {
          auditStore,
          catalog: new PostgresCatalog(database.sql),
          ...(config.REPLYWORK_RESPONDER === "catalog-natural"
            ? {
                interpreter: createGoogleCatalogInterpreter({
                  apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
                  modelId: config.REPLYWORK_CATALOG_MODEL,
                }),
              }
            : {}),
        }),
      },
      { visibilityTimeoutSeconds: config.WORKER_VISIBILITY_TIMEOUT_SECONDS },
    );
  } finally {
    await database.close();
  }
};
