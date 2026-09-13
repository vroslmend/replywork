import {
  ChatwootConversationProvider,
  createDatabase,
  PgmqDeliveryQueue,
  PostgresAuditStore,
  PostgresCatalog,
} from "@replywork/adapters";

import type { WorkerConfig } from "./config.js";
import { runWorkerOnce, type WorkerRunResult } from "./worker.js";
import { createWorkerResponder } from "./worker-responder.js";

export const runConfiguredWorkerOnce = async (config: WorkerConfig): Promise<WorkerRunResult> => {
  const database = createDatabase(config.DATABASE_URL);
  const auditStore = new PostgresAuditStore(database.sql);

  try {
    return await runWorkerOnce(
      {
        auditStore,
        conversationProvider: new ChatwootConversationProvider({
          accountId: config.CHATWOOT_ACCOUNT_ID,
          accessToken: config.CHATWOOT_API_ACCESS_TOKEN,
          baseUrl: config.CHATWOOT_BASE_URL,
          ...(config.CHATWOOT_HANDOFF_TEAM_ID === undefined
            ? {}
            : { handoffTeamId: config.CHATWOOT_HANDOFF_TEAM_ID }),
        }),
        deliveryQueue: new PgmqDeliveryQueue(database.sql),
        responder: createWorkerResponder(config, {
          auditStore,
          catalog: new PostgresCatalog(database.sql),
        }),
      },
      { visibilityTimeoutSeconds: config.WORKER_VISIBILITY_TIMEOUT_SECONDS },
    );
  } finally {
    await database.close();
  }
};
