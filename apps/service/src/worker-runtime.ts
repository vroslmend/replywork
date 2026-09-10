import {
  ChatwootConversationProvider,
  createDatabase,
  PgmqDeliveryQueue,
  PostgresAuditStore,
} from "@replywork/adapters";

import type { WorkerConfig } from "./config.js";
import { runWorkerOnce, type WorkerRunResult } from "./worker.js";

export const runConfiguredWorkerOnce = async (config: WorkerConfig): Promise<WorkerRunResult> => {
  const database = createDatabase(config.DATABASE_URL);

  try {
    return await runWorkerOnce(
      {
        auditStore: new PostgresAuditStore(database.sql),
        conversationProvider: new ChatwootConversationProvider({
          accountId: config.CHATWOOT_ACCOUNT_ID,
          accessToken: config.CHATWOOT_API_ACCESS_TOKEN,
          baseUrl: config.CHATWOOT_BASE_URL,
          ...(config.CHATWOOT_HANDOFF_TEAM_ID === undefined
            ? {}
            : { handoffTeamId: config.CHATWOOT_HANDOFF_TEAM_ID }),
        }),
        deliveryQueue: new PgmqDeliveryQueue(database.sql),
        responder: {
          decide: async () => ({ kind: "reply", text: config.REPLYWORK_REPLY_TEXT }),
        },
      },
      { visibilityTimeoutSeconds: config.WORKER_VISIBILITY_TIMEOUT_SECONDS },
    );
  } finally {
    await database.close();
  }
};
