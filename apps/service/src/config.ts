import { z } from "zod";

const serviceConfigSchema = z.object({
  CHATWOOT_WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const workerBaseSchema = z.object({
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_API_ACCESS_TOKEN: z.string().min(1),
  CHATWOOT_BASE_URL: z.url(),
  CHATWOOT_HANDOFF_TEAM_ID: optionalPositiveInteger,
  DATABASE_URL: z.url(),
  WORKER_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
});

const workerConfigSchema = z.discriminatedUnion("REPLYWORK_RESPONDER", [
  workerBaseSchema.extend({
    REPLYWORK_RESPONDER: z.literal("fixed"),
    REPLYWORK_REPLY_TEXT: z.string().trim().min(1),
  }),
  workerBaseSchema.extend({ REPLYWORK_RESPONDER: z.literal("catalog") }),
]);

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

const catalogConfigSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
});

export const loadCatalogConfig = (
  environment: NodeJS.ProcessEnv,
): z.infer<typeof catalogConfigSchema> => catalogConfigSchema.parse(environment);

const conversationControlSchema = catalogConfigSchema.extend({
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
});

export const loadConversationControlConfig = (
  environment: NodeJS.ProcessEnv,
): z.infer<typeof conversationControlSchema> => conversationControlSchema.parse(environment);

export const loadServiceConfig = (environment: NodeJS.ProcessEnv): ServiceConfig =>
  serviceConfigSchema.parse(environment);

export const loadWorkerConfig = (environment: NodeJS.ProcessEnv): WorkerConfig =>
  workerConfigSchema.parse({
    ...environment,
    REPLYWORK_RESPONDER: environment.REPLYWORK_RESPONDER ?? "fixed",
  });
