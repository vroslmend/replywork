import Fastify, { type FastifyInstance } from "fastify";

import { normalizeChatwootWebhook, verifyChatwootSignature } from "@replywork/adapters";
import { acceptDelivery, type DeliveryQueue } from "@replywork/core";

export interface CreateServiceAppOptions {
  deliveryQueue: DeliveryQueue;
  logger?: boolean;
  now?: () => Date;
  webhookSecret: string;
}

const headerValue = (header: string | readonly string[] | undefined): string | undefined =>
  typeof header === "string" ? header : header?.[0];

export const createServiceApp = (options: CreateServiceAppOptions): FastifyInstance => {
  const app = Fastify({ logger: options.logger ?? false });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/webhooks/chatwoot", async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: "request body must be JSON" });
    }

    const rawBody = request.body;
    const signature = verifyChatwootSignature({
      now: options.now?.() ?? new Date(),
      rawBody,
      secret: options.webhookSecret,
      signature: headerValue(request.headers["x-chatwoot-signature"]),
      timestamp: headerValue(request.headers["x-chatwoot-timestamp"]),
    });

    if (!signature.valid) {
      request.log.warn({ reason: signature.reason }, "rejected Chatwoot webhook");
      return reply.code(401).send({ error: "invalid webhook signature" });
    }

    const normalized = normalizeChatwootWebhook(
      rawBody,
      headerValue(request.headers["x-chatwoot-delivery"]),
    );

    if (normalized.status === "invalid") {
      request.log.info({ issues: normalized.issues }, "rejected Chatwoot payload");
      return reply.code(400).send({ error: "invalid webhook payload" });
    }

    if (normalized.status === "ignored") {
      return reply.code(202).send({ reason: normalized.reason, status: "ignored" });
    }

    const status = await acceptDelivery(options.deliveryQueue, normalized.event);
    return reply.code(202).send({ status });
  });

  return app;
};
