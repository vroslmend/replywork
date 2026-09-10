import type { FastifyInstance } from "fastify";

import { createDatabase, PgmqDeliveryQueue } from "@replywork/adapters";

import { createServiceApp } from "./app.js";
import { loadServiceConfig, type ServiceConfig } from "./config.js";

export const createServiceRuntime = (config: ServiceConfig): FastifyInstance => {
  const database = createDatabase(config.DATABASE_URL);
  const deliveryQueue = new PgmqDeliveryQueue(database.sql);
  const app = createServiceApp({
    deliveryQueue,
    logger: config.NODE_ENV !== "test",
    webhookSecret: config.CHATWOOT_WEBHOOK_SECRET,
  });

  app.addHook("onClose", async () => database.close());

  return app;
};

export const startService = async (
  environment: NodeJS.ProcessEnv = process.env,
): Promise<FastifyInstance> => {
  const config = loadServiceConfig(environment);
  const app = createServiceRuntime(config);

  await app.listen({ host: "0.0.0.0", port: config.PORT });

  return app;
};
